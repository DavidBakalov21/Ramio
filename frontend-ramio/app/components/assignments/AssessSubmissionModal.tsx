'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/axios';
import { SubmissionDetail } from '@/app/interfaces/Submission';

type RunResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

interface AssessSubmissionModalProps {
  isOpen: boolean;
  submissionId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AssessSubmissionModal({
  isOpen,
  submissionId,
  onClose,
  onSaved,
}: AssessSubmissionModalProps) {
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [points, setPoints] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (isOpen && submissionId) {
      fetchSubmission();
    }
  }, [isOpen, submissionId, fetchSubmission]);

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isOpen, isSaving, onClose]);

  const handleRunTests = async () => {
    if (!submissionId) return;
    setResult(null);
    setError(null);
    setIsRunning(true);
    try {
      const { data } = await api.post<RunResult>(`/assignment/submission/${submissionId}/run`);
      setResult(data);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          : null;
      setError((msg as string) || 'Failed to run tests');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSave = async () => {
    if (!submissionId) return;
    setError(null);
    setIsSaving(true);
    try {
      await api.patch(`/assignment/submission/${submissionId}`, {
        teacherFeedback: feedback,
        points,
        isChecked: true,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          : null;
      setError((msg as string) || 'Failed to save assessment');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="assess-submission-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <h2 id="assess-submission-title" className="text-lg font-semibold text-slate-900">
            Assess submission
          </h2>
          {submission && (
            <p className="mt-1 text-sm text-slate-500">
              {submission.user.username || submission.user.email}
              {submission.assignment && ` · ${submission.assignment.title}`}
            </p>
          )}
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading submission…</p>
          ) : error && !submission ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : submission ? (
            <>
              {/* Student's solution (read-only) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Student&apos;s solution
                </label>
                <pre className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-800 whitespace-pre-wrap">
                  {submission.solutionContent || '(No code submitted)'}
                </pre>
              </div>

              {/* Run tests */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Run tests
                </label>
                <button
                  type="button"
                  onClick={handleRunTests}
                  disabled={isRunning || !submission.solutionContent?.trim()}
                  className="rounded-full border border-violet-300 bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRunning ? 'Running…' : 'Run tests'}
                </button>
                {result && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <div
                      className={`text-sm font-medium ${result.success ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {result.success ? 'All tests passed' : 'Tests failed'}
                      {result.timedOut ? ' (timed out)' : ''}
                    </div>
                    {result.stdout && (
                      <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs text-slate-700">
                        {result.stdout}
                      </pre>
                    )}
                    {result.stderr && (
                      <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs text-red-700">
                        {result.stderr}
                      </pre>
                    )}
                  </div>
                )}
              </div>

              {/* Feedback */}
              <div>
                <label htmlFor="assess-feedback" className="mb-1 block text-xs font-medium text-slate-600">
                  Feedback
                </label>
                <textarea
                  id="assess-feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Write feedback for the student…"
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  disabled={isSaving}
                />
              </div>

              {/* Points */}
              <div>
                <label htmlFor="assess-points" className="mb-1 block text-xs font-medium text-slate-600">
                  Points
                </label>
                <input
                  id="assess-points"
                  type="number"
                  min={0}
                  max={submission.assignment?.points ?? 1000}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value) || 0)}
                  className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  disabled={isSaving}
                />
                {submission.assignment && (
                  <span className="ml-2 text-xs text-slate-500">
                    / {submission.assignment.points} max
                  </span>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !submission}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Save assessment'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null;
}
