'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { CourseProject } from '@/app/interfaces/Project';
import { ProjectSubmissionDetail } from '@/app/interfaces/Project';
import { User } from '@/app/interfaces/User';
import { Navbar } from '@/app/components/Navbar';
import { useToast } from '@/app/components/utility/toast';

const ARCHIVE_ACCEPT =
  '.zip,.tar.gz,.tgz,.tar,.rar,.7z,.tar.bz2,.tbz2,application/zip,application/x-zip-compressed';

export default function ProjectUploadPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const courseId = params.id as string;
  const projectId = params.projectId as string;

  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<CourseProject | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingProject, setLoadingProject] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [submission, setSubmission] = useState<ProjectSubmissionDetail | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get<User>('/me');
        const currentUser = res.data;
        if (!currentUser.role || !currentUser.username) {
          router.push('/onboarding');
          return;
        }
        setUser(currentUser);
      } catch {
        router.push('/login');
      } finally {
        setLoadingUser(false);
      }
    };
    void fetchUser();
  }, [router]);

  useEffect(() => {
    if (!projectId || !user?.role) return;
    const fetchProject = async () => {
      setLoadingProject(true);
      try {
        const res = await api.get<CourseProject>(`/project/${projectId}`);
        setProject(res.data);
      } catch {
        setProject(null);
      } finally {
        setLoadingProject(false);
      }
    };
    void fetchProject();
  }, [projectId, user?.role]);

  useEffect(() => {
    if (!projectId || !project?.submitted || user?.role !== 'STUDENT') return;
    const fetchSubmission = async () => {
      try {
        const res = await api.get<ProjectSubmissionDetail>(`/project/${projectId}/submission`);
        setSubmission(res.data);
      } catch {
        setSubmission(null);
      }
    };
    void fetchSubmission();
  }, [projectId, project?.submitted, user?.role]);

  const handleSubmit = async () => {
    if (!project || !file) return;
    setError('');
    setIsSubmitting(true);
    const isUpdate = !!project.submitted;
    try {
      const formData = new FormData();
      formData.append('files', file);
      if (isUpdate) {
        await api.patch(`/project/${projectId}/submission`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showToast('Submission updated.', 'success');
      } else {
        await api.post(`/project/${projectId}/submission`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showToast('Project submitted successfully.', 'success');
        setProject((prev) => (prev ? { ...prev, submitted: true } : null));
      }
      setFile(null);
      const subRes = await api.get<ProjectSubmissionDetail>(`/project/${projectId}/submission`);
      setSubmission(subRes.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      const errorMsg =
        status === 409
          ? 'You have already submitted this project.'
          : (msg as string) || 'Failed to submit';
      setError(errorMsg);
      showToast(errorMsg, 'error');
      if (status === 409) {
        setProject((prev) => (prev ? { ...prev, submitted: true } : null));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await api.post('/auth/logout');
      router.push('/login');
    } catch {
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isStudent = user?.role === 'STUDENT';
  const isAssessed = isStudent && !!submission?.isChecked;

  if (loadingUser || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-amber-50/20 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="rounded-[1.9rem] bg-white/85 p-6 shadow-xl backdrop-blur-sm ring-1 ring-white/60">
          <button
            type="button"
            onClick={() => router.push(`/courses/${courseId}`)}
            className="mb-4 text-xs font-medium text-slate-500 transition hover:text-slate-700"
          >
            ← Back to course
          </button>

          {loadingProject ? (
            <p className="text-sm text-slate-500">Loading project…</p>
          ) : !project ? (
            <div className="text-center">
              <p className="text-sm text-slate-600">Project not found or you don’t have access.</p>
              <button
                type="button"
                onClick={() => router.push(`/courses/${courseId}`)}
                className="mt-3 text-sm font-medium text-violet-600 hover:underline"
              >
                Back to course
              </button>
            </div>
          ) : (
            <>
              <header className="mb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-slate-900">{project.title}</h1>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    Project
                  </span>
                </div>
                {project.description && (
                  <p className="mt-2 text-sm text-slate-600">{project.description}</p>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  {project.points} pts
                  {project.dueDate && ` · Due ${new Date(project.dueDate).toLocaleDateString()}`}
                </p>
              </header>

              {isStudent && isAssessed && submission ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-green-200 bg-green-50/70 px-4 py-3 text-sm text-green-900">
                    <p className="font-semibold">
                      Your result: {submission.points} / {project.points} pts
                    </p>
                    {submission.teacherFeedback && (
                      <p className="mt-1 whitespace-pre-wrap text-xs">{submission.teacherFeedback}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Your submitted archive
                    </p>
                    <a
                      href={submission.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-sm font-medium text-violet-600 hover:underline"
                    >
                      {submission.name}
                    </a>
                  </div>
                </div>
              ) : isStudent ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Upload <strong>one</strong> archive file (.zip, .tar.gz, .rar, .7z, etc.).
                  </p>
                  {project.submitted && submission && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                      <p className="text-xs font-medium text-slate-500">Current file</p>
                      <a
                        href={submission.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block font-medium text-violet-600 hover:underline"
                      >
                        {submission.name}
                      </a>
                      <p className="mt-2 text-xs text-slate-500">
                        Choose a new file below to replace your submission.
                      </p>
                    </div>
                  )}
                  <div>
                    <label
                      htmlFor="project-archive"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      {project.submitted ? 'New archive' : 'Project archive'}
                    </label>
                    <input
                      id="project-archive"
                      type="file"
                      accept={ARCHIVE_ACCEPT}
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-amber-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-amber-900 hover:file:bg-amber-200"
                    />
                  </div>
                  {error && (
                    <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={isSubmitting || !file}
                      className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting
                        ? project.submitted
                          ? 'Updating…'
                          : 'Submitting…'
                        : project.submitted
                          ? 'Update submission'
                          : 'Submit project'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Open this page as an enrolled student to upload a project archive.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
