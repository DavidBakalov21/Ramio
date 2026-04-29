'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { SubmissionDetail } from '@/app/interfaces/Submission';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';

type RunResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export default function AssessAssignmentSubmissionPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const assignmentId = params.assignmentId as string;
  const submissionId = params.submissionId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [points, setPoints] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const fetchSubmission = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SubmissionDetail>(`/assignment/submission/${submissionId}`);
      setSubmission(res.data);
      setFeedback(res.data.teacherFeedback ?? '');
      setPoints(res.data.points ?? 0);
      setResult(null);
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

  const handleRunTests = async () => {
    setResult(null);
    setError(null);
    setIsRunning(true);
    try {
      const { data } = await api.post<RunResult>(`/assignment/submission/${submissionId}/run`);
      setResult(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to run tests');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await api.patch(`/assignment/submission/${submissionId}`, {
        teacherFeedback: feedback,
        points,
        isChecked: true,
      });
      router.push(`/courses/${courseId}/assignment/${assignmentId}/edit`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to save assessment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateAiFeedback = async () => {
    if (!submission) return;
    setError(null);
    setIsGeneratingAi(true);
    try {
      const { data } = await api.post<{ feedback: string; suggestedPoints?: number }>(
        `/assignment/${submission.assignment.id}/submission/${submission.id}/ai-feedback`,
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

  if (loadingUser) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  if (!user) return null;

  return (
    <TeacherPageShell user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
          <button type="button" onClick={() => router.push(`/courses/${courseId}/assignment/${assignmentId}/edit`)} className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700">← Back to assignment edit</button>
          <h1 className="text-xl font-semibold text-slate-900">Assess submission</h1>

          <div className="mt-4 space-y-4">
            {loading ? <p className="text-sm text-slate-500">Loading submission…</p> : null}
            {submission ? (
              <>
                <pre className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm whitespace-pre-wrap">{submission.solutionContent || '(No code submitted)'}</pre>
                <div>
                  <button type="button" onClick={() => void handleRunTests()} disabled={isRunning || !submission.solutionContent?.trim()} className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
                    {isRunning ? 'Running…' : 'Run tests'}
                  </button>
                  {result ? (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                      <div className={`text-sm font-medium ${result.success ? 'text-green-600' : 'text-red-600'}`}>{result.success ? 'All tests passed' : 'Tests failed'}{result.timedOut ? ' (timed out)' : ''}</div>
                      {result.stdout ? <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs text-slate-700">{result.stdout}</pre> : null}
                      {result.stderr ? <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs text-red-700">{result.stderr}</pre> : null}
                    </div>
                  ) : null}
                </div>
                <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={6} placeholder="Write feedback..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void handleGenerateAiFeedback()} disabled={isGeneratingAi || isSaving} className="rounded-full border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-60">
                    {isGeneratingAi ? 'Asking AI…' : 'Ask AI for feedback'}
                  </button>
                </div>
                <div>
                  <input type="number" min={0} max={submission.assignment?.points ?? 1000} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <span className="ml-2 text-xs text-slate-500">/ {submission.assignment.points} max</span>
                </div>
              </>
            ) : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => router.push(`/courses/${courseId}/assignment/${assignmentId}/edit`)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={() => void handleSave()} disabled={isSaving || !submission} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {isSaving ? 'Saving…' : 'Save assessment'}
              </button>
            </div>
          </div>
    </TeacherPageShell>
  );
}

