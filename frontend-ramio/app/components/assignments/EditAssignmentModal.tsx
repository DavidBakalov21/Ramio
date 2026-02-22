'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/axios';
import { Assignment } from '@/app/interfaces/Assignment';
import { AssignmentLanguage } from '@/app/interfaces/Assignment';
import { ASSIGNMENT_LANGUAGE_MAP } from '@/app/constants/assignmentLanguages';
import { SubmissionListItem } from '@/app/interfaces/Submission';
import { AssessSubmissionModal } from './AssessSubmissionModal';

export interface EditAssignmentFormData {
  title: string;
  description: string;
  points: number;
  language: AssignmentLanguage;
  dueDate: string;
  newTestFile: File | null;
  newTestCode: string;
}

interface EditAssignmentModalProps {
  isOpen: boolean;
  assignment: Assignment | null;
  onClose: () => void;
  onSubmit: (data: EditAssignmentFormData) => Promise<void>;
  onDelete?: (assignmentId: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

export function EditAssignmentModal({
  isOpen,
  assignment,
  onClose,
  onSubmit,
  onDelete,
  isSubmitting,
  error,
}: EditAssignmentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(100);
  const [language, setLanguage] = useState<AssignmentLanguage>('PYTHON');
  const [dueDate, setDueDate] = useState('');
  const [newTestFile, setNewTestFile] = useState<File | null>(null);
  const [newTestCode, setNewTestCode] = useState('');
  const [testCodeLoading, setTestCodeLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [assessModalOpen, setAssessModalOpen] = useState(false);
  const [assessSubmissionId, setAssessSubmissionId] = useState<string | null>(null);

  const fetchTestCode = useCallback(async (assignmentId: string) => {
    setTestCodeLoading(true);
    try {
      const res = await api.get<string>(`/assignment/${assignmentId}/test-file`);
      setNewTestCode(typeof res.data === 'string' ? res.data : String(res.data ?? ''));
    } catch {
      setNewTestCode('');
    } finally {
      setTestCodeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && assignment) {
      setTitle(assignment.title);
      setDescription(assignment.description ?? '');
      setPoints(assignment.points);
      setLanguage(assignment.language);
      setDueDate(
        assignment.dueDate ? new Date(assignment.dueDate).toISOString().slice(0, 10) : '',
      );
      setNewTestFile(null);
      setValidationError('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (assignment.test) {
        setNewTestCode('');
        fetchTestCode(assignment.id);
      } else {
        setNewTestCode('');
        setTestCodeLoading(false);
      }

      setSubmissions([]);
      setAssessModalOpen(false);
      setAssessSubmissionId(null);
      const fetchSubmissions = async () => {
        setSubmissionsLoading(true);
        try {
          const res = await api.get<SubmissionListItem[]>(`/assignment/${assignment.id}/submissions`);
          setSubmissions(res.data);
        } catch {
          setSubmissions([]);
        } finally {
          setSubmissionsLoading(false);
        }
      };
      fetchSubmissions();
    }
  }, [isOpen, assignment, fetchTestCode]);

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
      newTestFile,
      newTestCode: newTestCode.trim(),
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setNewTestFile(file ?? null);
    if (file) setNewTestCode('');
  };

  const openAssessModal = (submissionId: string) => {
    setAssessSubmissionId(submissionId);
    setAssessModalOpen(true);
  };

  const handleAssessSaved = useCallback(() => {
    if (assignment) {
      api.get<SubmissionListItem[]>(`/assignment/${assignment.id}/submissions`).then((res) => {
        setSubmissions(res.data);
      });
    }
  }, [assignment]);

  const handleDelete = async () => {
    if (!assignment || !onDelete) return;
    if (!confirm(`Delete assignment "${assignment.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(assignment.id);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen || !assignment) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-assignment-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-assignment-title" className="text-lg font-semibold text-slate-900">
          Edit assignment
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="edit-assignment-title-input"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Title
            </label>
            <input
              id="edit-assignment-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Week 1 – Variables"
              maxLength={255}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="edit-assignment-description"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="edit-assignment-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the assignment"
              rows={2}
              maxLength={2000}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-assignment-points"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Points
              </label>
              <input
                id="edit-assignment-points"
                type="number"
                min={0}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label
                htmlFor="edit-assignment-due-date"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Due date <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="edit-assignment-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="edit-assignment-language"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Language
            </label>
            <select
              id="edit-assignment-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as AssignmentLanguage)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
            >
              {(Object.keys(ASSIGNMENT_LANGUAGE_MAP) as AssignmentLanguage[]).map((lang) => (
                <option key={lang} value={lang}>
                  {ASSIGNMENT_LANGUAGE_MAP[lang].label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <p className="mb-2 text-xs font-medium text-slate-600">Test file</p>
            {assignment.test && !newTestFile && (
              <p className="mb-2 text-xs text-slate-500">
                Current: {assignment.test.name}{' '}
                <a
                  href={assignment.test.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-600 hover:underline"
                >
                  View
                </a>
                {testCodeLoading && ' · Loading…'}
              </p>
            )}
            <div className="space-y-2">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".py,.js"
                  onChange={handleFileChange}
                  disabled={isSubmitting}
                  className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-full file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-300"
                />
                {newTestFile && (
                  <p className="mt-1 text-xs text-slate-500">
                    Selected: {newTestFile.name} (will overwrite current)
                  </p>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {assignment.test ? 'Edit test code below:' : 'or paste new test code:'}
              </p>
              <textarea
                value={newTestCode}
                onChange={(e) => {
                  setNewTestCode(e.target.value);
                  if (e.target.value) setNewTestFile(null);
                }}
                placeholder={
                  testCodeLoading
                    ? 'Loading…'
                    : ASSIGNMENT_LANGUAGE_MAP[language].testCodePlaceholder
                }
                rows={6}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={isSubmitting}
                spellCheck={false}
              />
            </div>
          </div>

          {/* Submissions section for teachers */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <p className="mb-2 text-xs font-medium text-slate-600">Submissions</p>
            {submissionsLoading ? (
              <p className="text-xs text-slate-500">Loading submissions…</p>
            ) : submissions.length === 0 ? (
              <p className="text-xs text-slate-500">No submissions yet.</p>
            ) : (
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {submissions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {s.user.username || s.user.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.isChecked
                          ? `${s.points} pts · Checked`
                          : 'Not assessed yet'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAssessModal(s.id)}
                      disabled={isSubmitting}
                      className="shrink-0 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
                    >
                      Assess
                    </button>
                  </li>
                ))}
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
                onClick={handleDelete}
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
      <AssessSubmissionModal
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
