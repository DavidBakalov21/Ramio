'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { ProjectSubmissionDetail } from '@/app/interfaces/Project';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';
import { ProjectFileViewer } from '@/app/components/projects/ProjectFileViewer';

export default function AssessProjectSubmissionPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const projectId = params.projectId as string;
  const submissionId = params.submissionId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [submission, setSubmission] = useState<ProjectSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [points, setPoints] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const fetchSubmission = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ProjectSubmissionDetail>(`/project/submission/${submissionId}`);
      setSubmission(res.data);
      setFeedback(res.data.teacherFeedback ?? '');
      setPoints(res.data.points ?? 0);
    } catch {
      setSubmission(null);
      setError('Failed to load submission');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    if (user) void fetchSubmission();
  }, [user, fetchSubmission]);

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await api.patch(`/project/submission/${submissionId}`, {
        teacherFeedback: feedback,
        points,
        isChecked: true,
      });
      router.push(`/courses/${courseId}/project/${projectId}/edit`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to save assessment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateAiFeedback = async () => {
    if (!submission?.project?.id) return;
    setError(null);
    setIsGeneratingAi(true);
    try {
      const { data } = await api.post<{ feedback: string; suggestedPoints?: number }>(
        `/project/${submission.project.id}/submission/${submissionId}/ai-feedback`,
      );
      if (data.feedback) setFeedback(data.feedback);
      if (typeof data.suggestedPoints === 'number' && !Number.isNaN(data.suggestedPoints)) {
        setPoints(data.suggestedPoints);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to get AI feedback');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const isZipArchive = !!submission?.name?.toLowerCase().endsWith('.zip');

  if (loadingUser) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  if (!user) return null;

  return (
    <TeacherPageShell
      user={user}
      onLogout={handleLogout}
      isLoggingOut={isLoggingOut}
      maxWidthClassName="max-w-7xl"
    >
      <button
        type="button"
        onClick={() => router.push(`/courses/${courseId}/project/${projectId}/edit`)}
        className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        ← Back to project edit
      </button>
      <h1 className="text-xl font-semibold text-slate-900">Assess project submission</h1>

      {loading && <p className="mt-4 text-sm text-slate-500">Loading submission…</p>}

      {submission && (
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start">

          {/* ── File explorer (main column) ─────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <ProjectFileViewer
              submissionId={submissionId}
              submissionName={submission.name}
              isTeacher
            />
          </div>

          {/* ── Assessment sidebar ──────────────────────────────────────── */}
          <div className="w-full lg:w-80 shrink-0 space-y-4">

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Submitted archive
                </p>
                <a
                  href={submission.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-sm font-medium text-violet-600 hover:underline"
                >
                  {submission.name}
                </a>
              </div>

              {submission.project?.assessmentPrompt && (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Assessment notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                    {submission.project.assessmentPrompt}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Feedback</p>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                placeholder="Write feedback..."
              />
              <button
                type="button"
                onClick={() => void handleGenerateAiFeedback()}
                disabled={isGeneratingAi || isSaving || !isZipArchive}
                className="w-full rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-60"
              >
                {isGeneratingAi ? 'Asking AI…' : '✨ Ask AI from zip contents'}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <p className="text-sm font-semibold text-slate-700">Points</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={submission.project?.points ?? 1000}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value) || 0)}
                  className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
                <span className="text-xs text-slate-500">
                  / {submission.project?.points ?? 0} max
                </span>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push(`/courses/${courseId}/project/${projectId}/edit`)}
                className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || !submission}
                className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : 'Save assessment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && !submission && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}
    </TeacherPageShell>
  );
}
