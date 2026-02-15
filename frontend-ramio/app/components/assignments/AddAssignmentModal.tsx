'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AssignmentLanguage } from '@/app/interfaces/Assignment';
import { ASSIGNMENT_LANGUAGE_MAP } from '@/app/constants/assignmentLanguages';

export interface AddAssignmentFormData {
  title: string;
  description: string;
  points: number;
  language: AssignmentLanguage;
  testCode: string;
}

interface AddAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AddAssignmentFormData) => void;
  isSubmitting: boolean;
  error: string | null;
}

export function AddAssignmentModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: AddAssignmentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(100);
  const [language, setLanguage] = useState<AssignmentLanguage>('PYTHON');
  const [testCode, setTestCode] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setPoints(100);
      setLanguage('PYTHON');
      setTestCode('');
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
      testCode: testCode.trim(),
    });
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-assignment-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-assignment-title" className="text-lg font-semibold text-slate-900">
          Add assignment
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="add-assignment-title-input" className="block text-xs font-medium text-slate-600 mb-1">
              Title
            </label>
            <input
              id="add-assignment-title-input"
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
            <label htmlFor="add-assignment-description" className="block text-xs font-medium text-slate-600 mb-1">
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="add-assignment-description"
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
              <label htmlFor="add-assignment-points" className="block text-xs font-medium text-slate-600 mb-1">
                Points
              </label>
              <input
                id="add-assignment-points"
                type="number"
                min={0}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label htmlFor="add-assignment-language" className="block text-xs font-medium text-slate-600 mb-1">
                Language
              </label>
              <select
                id="add-assignment-language"
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
          </div>
          <div>
            <label htmlFor="add-assignment-test-code" className="block text-xs font-medium text-slate-600 mb-1">
              Test code <span className="text-slate-400">(optional)</span>
            </label>
            <p className="mb-1 text-[11px] text-slate-400">
              {ASSIGNMENT_LANGUAGE_MAP[language].testCodeHint}
            </p>
            <textarea
              id="add-assignment-test-code"
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              placeholder={ASSIGNMENT_LANGUAGE_MAP[language].testCodePlaceholder}
              rows={10}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={isSubmitting}
              spellCheck={false}
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
