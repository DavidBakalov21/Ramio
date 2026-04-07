'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/axios';
import { ProjectSubmissionDetail } from '@/app/interfaces/Project';

interface AssessProjectSubmissionModalProps {
  isOpen: boolean;
  submissionId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AssessProjectSubmissionModal({
  isOpen,
  submissionId,
  onClose,
  onSaved,
}: AssessProjectSubmissionModalProps) {
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
      const res = await api.get<ProjectSubmissionDetail>(
        `/project/submission/${submissionId}`,
      );
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
    if (isOpen && submissionId) {
      void fetchSubmission();
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

  const handleSave = async () => {
    if (!submissionId) return;
    setError(null);
    setIsSaving(true);
    try {
      await api.patch(`/project/submission/${submissionId}`, {
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

  const handleGenerateAiFeedback = async () => {
    if (!submissionId || !submission?.project?.id) return;
    setError(null);
    setIsGeneratingAi(true);
    try {
      const { data } = await api.post<{
        feedback: string;
        suggestedPoints?: number;
        warnings?: string[];
      }>(
        `/project/${submission.project.id}/submission/${submissionId}/ai-feedback`,
      );
      if (data.feedback) {
        setFeedback(data.feedback);
      }
      if (
        typeof data.suggestedPoints === 'number' &&
        !Number.isNaN(data.suggestedPoints)
      ) {
        setPoints(data.suggestedPoints);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } })?.response?.data
              ?.message
          : null;
      setError((msg as string) || 'Failed to get AI feedback');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const isZipArchive =
    !!submission?.name?.toLowerCase().endsWith('.zip');

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="assess-project-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <h2 id="assess-project-title" className="text-lg font-semibold text-slate-900">
            Assess project submission
          </h2>
          {submission && (
            <p className="mt-1 text-sm text-slate-500">
              {submission.user.username || submission.user.email}
              {submission.project && ` · ${submission.project.title}`}
            </p>
          )}
        </div>

        <div className="space-y-4 p-6">
          {loading ? (
            <p className="text-sm text-slate-500">Loading submission…</p>
          ) : error && !submission ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : submission ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Submitted archive
                </label>
                <a
                  href={submission.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-sm font-medium text-violet-600 hover:underline"
                >
                  {submission.name}
                </a>
              </div>
              {submission.project?.assessmentPrompt && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Your assessment notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                    {submission.project.assessmentPrompt}
                  </p>
                </div>
              )}
              <div>
                <label htmlFor="assess-project-feedback" className="mb-1 block text-xs font-medium text-slate-600">
                  Feedback
                </label>
                <textarea
                  id="assess-project-feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Write feedback for the student…"
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  disabled={isSaving}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleGenerateAiFeedback()}
                    disabled={isGeneratingAi || isSaving || !submission || !isZipArchive}
                    className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGeneratingAi ? 'Asking AI…' : 'Ask AI from zip contents'}
                  </button>
                  <p className="text-[11px] text-slate-400">
                    {isZipArchive
                      ? 'Requires the ZIP parser Lambda (S3 read + text files only).'
                      : 'AI extract works only for .zip submissions.'}
                  </p>
                </div>
              </div>
              <div>
                <label htmlFor="assess-project-points" className="mb-1 block text-xs font-medium text-slate-600">
                  Points
                </label>
                <input
                  id="assess-project-points"
                  type="number"
                  min={0}
                  max={submission.project?.points ?? 1000}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value) || 0)}
                  className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  disabled={isSaving}
                />
                {submission.project?.points != null && (
                  <span className="ml-2 text-xs text-slate-500">/ {submission.project.points} max</span>
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
            onClick={() => void handleSave()}
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
