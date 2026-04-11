'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { PROJECT_LANGUAGE_OPTIONS, type ProjectLanguage } from '@/app/interfaces/Project';

export interface AddProjectFormData {
  title: string;
  description: string;
  points: number;
  language: ProjectLanguage;
  dueDate: string;
  assessmentPrompt: string;
}

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AddProjectFormData) => void;
  isSubmitting: boolean;
  error: string | null;
}

export function AddProjectModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: AddProjectModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(100);
  const [language, setLanguage] = useState<ProjectLanguage>('PYTHON');
  const [dueDate, setDueDate] = useState('');
  const [assessmentPrompt, setAssessmentPrompt] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setPoints(100);
      setLanguage('PYTHON');
      setDueDate('');
      setAssessmentPrompt('');
      setValidationError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isOpen, isSubmitting, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setValidationError('Title is required');
      return;
    }
    setValidationError('');
    onSubmit({
      title: trimmedTitle,
      description: description.trim(),
      points: points >= 0 ? points : 100,
      language,
      dueDate,
      assessmentPrompt: assessmentPrompt.trim(),
    });
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-project-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-project-title" className="text-lg font-semibold text-slate-900">
          Add project
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Students upload one archive (.zip, .tar.gz, etc.) instead of using the code sandbox.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="add-project-title-input" className="mb-1 block text-xs font-medium text-slate-600">
              Title
            </label>
            <input
              id="add-project-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Final project"
              maxLength={255}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="add-project-description" className="mb-1 block text-xs font-medium text-slate-600">
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="add-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What students should deliver"
              rows={2}
              maxLength={2000}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label htmlFor="add-project-language" className="mb-1 block text-xs font-medium text-slate-600">
              Language / CodeBuild stack
            </label>
            <select
              id="add-project-language"
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
            <p className="mt-1 text-[11px] text-slate-400">
              Chooses which AWS CodeBuild project runs for &quot;Run tests&quot; (see CODEBUILD_PROJECT_* env vars).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-project-points" className="mb-1 block text-xs font-medium text-slate-600">
                Points
              </label>
              <input
                id="add-project-points"
                type="number"
                min={0}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label htmlFor="add-project-due" className="mb-1 block text-xs font-medium text-slate-600">
                Due date <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="add-project-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div>
            <label htmlFor="add-project-prompt" className="mb-1 block text-xs font-medium text-slate-600">
              Assessment notes <span className="text-slate-400">(optional, for you)</span>
            </label>
            <textarea
              id="add-project-prompt"
              value={assessmentPrompt}
              onChange={(e) => setAssessmentPrompt(e.target.value)}
              placeholder="Rubric, criteria, or reminders while grading"
              rows={4}
              maxLength={20000}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
            />
          </div>
          {(validationError || error) && (
            <p className="text-sm text-red-600">{validationError || error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {isSubmitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null;
}
