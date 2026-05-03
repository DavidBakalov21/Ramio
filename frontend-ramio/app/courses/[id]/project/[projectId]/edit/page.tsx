'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { CourseProject, PROJECT_LANGUAGE_OPTIONS, ProjectLanguage, ProjectSubmissionListItem } from '@/app/interfaces/Project';
import { useToast } from '@/app/components/utility/toast';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';

export default function EditProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const courseId = params.id as string;
  const projectId = params.projectId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [codeBuildLoadingId, setCodeBuildLoadingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(100);
  const [language, setLanguage] = useState<ProjectLanguage>('PYTHON');
  const [dueDate, setDueDate] = useState('');
  const [assessmentPrompt, setAssessmentPrompt] = useState('');
  const [submissions, setSubmissions] = useState<ProjectSubmissionListItem[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const loadProject = async () => {
    setLoading(true);
    try {
      const [projectRes, submissionsRes] = await Promise.all([
        api.get<CourseProject>(`/project/${projectId}`),
        api.get<ProjectSubmissionListItem[]>(`/project/${projectId}/submissions?syncCodeBuild=1`),
      ]);
      const p = projectRes.data;
      setTitle(p.title);
      setDescription(p.description ?? '');
      setPoints(p.points);
      setLanguage(p.language);
      setDueDate(p.dueDate ? new Date(p.dueDate).toISOString().slice(0, 10) : '');
      setAssessmentPrompt(p.assessmentPrompt ?? '');
      setSubmissions(submissionsRes.data);
    } catch {
      setError('Failed to load project.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, projectId]);

  const hasCodeBuildInProgress = submissions.some((s) => s.codeBuildStatus === 'IN_PROGRESS');
  useEffect(() => {
    if (!hasCodeBuildInProgress) return;
    const id = setInterval(() => {
      void api.get<ProjectSubmissionListItem[]>(`/project/${projectId}/submissions?syncCodeBuild=1`).then((res) => setSubmissions(res.data)).catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [hasCodeBuildInProgress, projectId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const dueDateSeconds = dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : null;
      await api.patch(`/project/${projectId}`, {
        title: title.trim(),
        description: description.trim() || undefined,
        points,
        language,
        dueDate: dueDateSeconds,
        assessmentPrompt: assessmentPrompt.trim() || null,
      });
      showToast('Project updated.', 'success');
      await loadProject();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.delete(`/project/${projectId}`);
      showToast('Project deleted.', 'success');
      router.push(`/courses/${courseId}`);
    } catch {
      setError('Failed to delete project.');
    } finally {
      setDeleting(false);
    }
  };

  const handleRunCodeBuild = async (submissionId: string) => {
    setCodeBuildLoadingId(submissionId);
    try {
      await api.post(`/project/${projectId}/submission/${submissionId}/codebuild-run`);
      const res = await api.get<ProjectSubmissionListItem[]>(`/project/${projectId}/submissions?syncCodeBuild=1`);
      setSubmissions(res.data);
      showToast('CodeBuild run started.', 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      showToast(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Could not start CodeBuild', 'error');
    } finally {
      setCodeBuildLoadingId(null);
    }
  };

  if (loadingUser || loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  if (!user) return null;

  return (
    <TeacherPageShell user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
          <button type="button" onClick={() => router.push(`/courses/${courseId}`)} className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700">← Back to course</button>
          <h1 className="text-xl font-semibold text-slate-900">Edit project</h1>

          <form onSubmit={handleSave} className="mt-5 grid gap-4">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Title" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Description" />
            <div className="grid gap-3 sm:grid-cols-3">
              <select value={language} onChange={(e) => setLanguage(e.target.value as ProjectLanguage)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                {PROJECT_LANGUAGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <textarea value={assessmentPrompt} onChange={(e) => setAssessmentPrompt(e.target.value)} rows={6} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Assessment notes" />

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-600">Submissions</p>
              {submissionsLoading ? <p className="text-xs text-slate-500">Loading submissions…</p> : null}
              {submissions.length === 0 ? <p className="text-xs text-slate-500">No submissions yet.</p> : (
                <ul className="space-y-2">
                  {submissions.map((s) => {
                    const isZip = s.name.toLowerCase().endsWith('.zip');
                    const p = typeof s.codeBuildTestsPassed === 'number' ? s.codeBuildTestsPassed : 0;
                    const f = typeof s.codeBuildTestsFailed === 'number' ? s.codeBuildTestsFailed : 0;
                    const sk = typeof s.codeBuildTestsSkipped === 'number' ? s.codeBuildTestsSkipped : 0;
                    const total = p + f + sk;
                    const hasCounts = typeof s.codeBuildTestsPassed === 'number' || typeof s.codeBuildTestsFailed === 'number' || typeof s.codeBuildTestsSkipped === 'number';
                    return (
                      <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{s.user.username || s.user.email}</p>
                          <p className="text-xs text-slate-500">{s.isChecked ? `${s.points} pts · Checked` : 'Not assessed yet'}</p>
                          <p className="text-[11px] text-slate-400">CodeBuild: {s.codeBuildStatus ?? '—'}{hasCounts ? <span className="text-slate-500"> — Successful: {p} · Failed: {f} · Total: {total}</span> : null}</p>
                        </div>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => void handleRunCodeBuild(s.id)} disabled={!isZip || codeBuildLoadingId === s.id || s.codeBuildStatus === 'IN_PROGRESS'} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60">
                            {codeBuildLoadingId === s.id ? 'Starting…' : s.codeBuildStatus === 'IN_PROGRESS' ? 'Running…' : 'Run tests'}
                          </button>
                          <button type="button" onClick={() => router.push(`/courses/${courseId}/project/${projectId}/submission/${s.id}/assess`)} className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
                            Assess
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => void handleDelete()} disabled={deleting || submitting} className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60">{deleting ? 'Deleting…' : 'Delete'}</button>
              <button type="submit" disabled={submitting || deleting} className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{submitting ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
    </TeacherPageShell>
  );
}

