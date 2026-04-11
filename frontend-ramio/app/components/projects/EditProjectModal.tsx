'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/axios';
import {
  CourseProject,
  PROJECT_LANGUAGE_OPTIONS,
  ProjectSubmissionListItem,
  type ProjectLanguage,
} from '@/app/interfaces/Project';
import { useToast } from '@/app/components/utility/toast';
import { AssessProjectSubmissionModal } from './AssessProjectSubmissionModal';

export interface EditProjectFormData {
  title: string;
  description: string;
  points: number;
  language: ProjectLanguage;
  dueDate: string;
  assessmentPrompt: string;
}

interface EditProjectModalProps {
  isOpen: boolean;
  project: CourseProject | null;
  onClose: () => void;
  onSubmit: (data: EditProjectFormData) => Promise<void>;
  onDelete?: (projectId: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

export function EditProjectModal({
  isOpen,
  project,
  onClose,
  onSubmit,
  onDelete,
  isSubmitting,
  error,
}: EditProjectModalProps) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(100);
  const [language, setLanguage] = useState<ProjectLanguage>('PYTHON');
  const [dueDate, setDueDate] = useState('');
  const [assessmentPrompt, setAssessmentPrompt] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [submissions, setSubmissions] = useState<ProjectSubmissionListItem[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [assessModalOpen, setAssessModalOpen] = useState(false);
  const [assessSubmissionId, setAssessSubmissionId] = useState<string | null>(null);
  const [codeBuildLoadingId, setCodeBuildLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && project) {
      setTitle(project.title);
      setDescription(project.description ?? '');
      setPoints(project.points);
      setLanguage(project.language ?? 'PYTHON');
      setDueDate(project.dueDate ? new Date(project.dueDate).toISOString().slice(0, 10) : '');
      setAssessmentPrompt(project.assessmentPrompt ?? '');
      setValidationError('');
      setSubmissions([]);
      setAssessModalOpen(false);
      setAssessSubmissionId(null);
      const fetchSubmissions = async () => {
        setSubmissionsLoading(true);
        try {
          const res = await api.get<ProjectSubmissionListItem[]>(
            `/project/${project.id}/submissions?syncCodeBuild=1`,
          );
          setSubmissions(res.data);
        } catch {
          setSubmissions([]);
        } finally {
          setSubmissionsLoading(false);
        }
      };
      void fetchSubmissions();
    }
  }, [isOpen, project]);

  const hasCodeBuildInProgress = submissions.some(
    (s) => s.codeBuildStatus === 'IN_PROGRESS',
  );

  useEffect(() => {
    if (!isOpen || !project || !hasCodeBuildInProgress) return;
    const id = setInterval(() => {
      void api
        .get<ProjectSubmissionListItem[]>(
          `/project/${project.id}/submissions?syncCodeBuild=1`,
        )
        .then((res) => setSubmissions(res.data))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [isOpen, project?.id, hasCodeBuildInProgress]);

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !deleting) onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isOpen, isSubmitting, deleting, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setValidationError('Title is required');
      return;
    }
    setValidationError('');
    await onSubmit({
      title: trimmedTitle,
      description: description.trim(),
      points: points >= 0 ? points : 100,
      language,
      dueDate,
      assessmentPrompt: assessmentPrompt.trim(),
    });
  };

  const openAssessModal = (submissionId: string) => {
    setAssessSubmissionId(submissionId);
    setAssessModalOpen(true);
  };

  const handleAssessSaved = useCallback(() => {
    if (project) {
      void api
        .get<ProjectSubmissionListItem[]>(
          `/project/${project.id}/submissions?syncCodeBuild=1`,
        )
        .then((res) => {
          setSubmissions(res.data);
        });
    }
  }, [project]);

  const handleRunCodeBuild = async (submissionId: string) => {
    if (!project) return;
    setCodeBuildLoadingId(submissionId);
    try {
      await api.post(`/project/${project.id}/submission/${submissionId}/codebuild-run`);
      const res = await api.get<ProjectSubmissionListItem[]>(
        `/project/${project.id}/submissions?syncCodeBuild=1`,
      );
      setSubmissions(res.data);
      showToast('CodeBuild run started.', 'success');
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string | string[] } } })?.response
        ?.data?.message;
      const msg = Array.isArray(res) ? res[0] : typeof res === 'string' ? res : 'Could not start CodeBuild';
      showToast(msg, 'error');
    } finally {
      setCodeBuildLoadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!project || !onDelete) return;
    if (!confirm(`Delete project "${project.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(project.id);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen || !project) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-project-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-project-title" className="text-lg font-semibold text-slate-900">
          Edit project
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="edit-project-title-input"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Title
            </label>
            <input
              id="edit-project-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="edit-project-description"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="edit-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label htmlFor="edit-project-language" className="mb-1 block text-xs font-medium text-slate-600">
              Language / CodeBuild stack
            </label>
            <select
              id="edit-project-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as ProjectLanguage)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
            >
              {PROJECT_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-project-points" className="mb-1 block text-xs font-medium text-slate-600">
                Points
              </label>
              <input
                id="edit-project-points"
                type="number"
                min={0}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label htmlFor="edit-project-due" className="mb-1 block text-xs font-medium text-slate-600">
                Due date <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="edit-project-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div>
            <label htmlFor="edit-project-prompt" className="mb-1 block text-xs font-medium text-slate-600">
              Assessment notes <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="edit-project-prompt"
              value={assessmentPrompt}
              onChange={(e) => setAssessmentPrompt(e.target.value)}
              rows={4}
              maxLength={20000}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <p className="mb-2 text-xs font-medium text-slate-600">Submissions</p>
            {submissionsLoading ? (
              <p className="text-xs text-slate-500">Loading submissions…</p>
            ) : submissions.length === 0 ? (
              <p className="text-xs text-slate-500">No submissions yet.</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-y-auto">
                {submissions.map((s) => {
                  const isZip = s.name.toLowerCase().endsWith('.zip');
                  const cbLabel =
                    s.codeBuildStatus === 'IN_PROGRESS' && s.codeBuildPhase
                      ? `${s.codeBuildStatus} · ${s.codeBuildPhase}`
                      : s.codeBuildStatus ?? '—';
                  const passed = s.codeBuildTestsPassed;
                  const failed = s.codeBuildTestsFailed;
                  const skipped = s.codeBuildTestsSkipped;
                  const hasTestCounts =
                    typeof passed === 'number' ||
                    typeof failed === 'number' ||
                    typeof skipped === 'number';
                  const testSummary =
                    hasTestCounts && s.codeBuildStatus !== 'IN_PROGRESS'
                      ? (() => {
                          const p = typeof passed === 'number' ? passed : 0;
                          const f = typeof failed === 'number' ? failed : 0;
                          const sk = typeof skipped === 'number' ? skipped : 0;
                          const total = p + f + sk;
                          return `Successful: ${p} · Failed: ${f} · Total: ${total}`;
                        })()
                      : null;
                  return (
                    <li
                      key={s.id}
                      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {s.user.username || s.user.email}
                        </p>
                        <p className="text-xs text-slate-500">
                          {s.isChecked ? `${s.points} pts · Checked` : 'Not assessed yet'}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          CodeBuild: {cbLabel}
                          {testSummary ? (
                            <span className="text-slate-500"> — {testSummary}</span>
                          ) : null}
                          {s.codeBuildTestMetricsAt &&
                          s.codeBuildStatus !== 'IN_PROGRESS' &&
                          !testSummary ? (
                            <span className="text-slate-400">
                              {' '}
                              — test summary not detected in logs
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void handleRunCodeBuild(s.id)}
                          disabled={
                            isSubmitting ||
                            codeBuildLoadingId === s.id ||
                            !isZip ||
                            s.codeBuildStatus === 'IN_PROGRESS'
                          }
                          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          title={
                            !isZip
                              ? 'CodeBuild uses S3 ZIP source; submission must be .zip'
                              : undefined
                          }
                        >
                          {codeBuildLoadingId === s.id
                            ? 'Starting…'
                            : s.codeBuildStatus === 'IN_PROGRESS'
                              ? 'Running…'
                              : 'Run tests'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openAssessModal(s.id)}
                          disabled={isSubmitting}
                          className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-60"
                        >
                          Assess
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {(validationError || error) && (
            <p className="text-sm text-red-600">{validationError || error}</p>
          )}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            {onDelete ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isSubmitting || deleting}
                className="self-start rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2 sm:ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || deleting}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || deleting}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null}
      <AssessProjectSubmissionModal
        isOpen={assessModalOpen}
        submissionId={assessSubmissionId}
        onClose={() => {
          setAssessModalOpen(false);
          setAssessSubmissionId(null);
        }}
        onSaved={handleAssessSaved}
      />
    </>
  );
}
