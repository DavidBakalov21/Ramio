'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { ProjectSubmissionDetail } from '@/app/interfaces/Project';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';

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
    <TeacherPageShell user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
          <button type="button" onClick={() => router.push(`/courses/${courseId}/project/${projectId}/edit`)} className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700">← Back to project edit</button>
          <h1 className="text-xl font-semibold text-slate-900">Assess project submission</h1>

          <div className="mt-4 space-y-4">
            {loading ? <p className="text-sm text-slate-500">Loading submission…</p> : null}
            {submission ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Submitted archive</label>
                  <a href={submission.url} target="_blank" rel="noreferrer" className="inline-flex text-sm font-medium text-violet-600 hover:underline">{submission.name}</a>
                </div>
                {submission.project?.assessmentPrompt ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Your assessment notes</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{submission.project.assessmentPrompt}</p>
                  </div>
                ) : null}
                <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={6} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Write feedback..." />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void handleGenerateAiFeedback()} disabled={isGeneratingAi || isSaving || !isZipArchive} className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-60">
                    {isGeneratingAi ? 'Asking AI…' : 'Ask AI from zip contents'}
                  </button>
                </div>
                <div>
                  <input type="number" min={0} max={submission.project?.points ?? 1000} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <span className="ml-2 text-xs text-slate-500">/ {submission.project?.points ?? 0} max</span>
                </div>
              </>
            ) : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => router.push(`/courses/${courseId}/project/${projectId}/edit`)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void handleSave()} disabled={isSaving || !submission} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {isSaving ? 'Saving…' : 'Save assessment'}
              </button>
            </div>
          </div>
    </TeacherPageShell>
  );
}

