'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CourseMaterialType } from '@/app/interfaces/Material';

export type AddMaterialKind = 'FILE' | 'LINK';

export interface AddMaterialFormData {
  kind: AddMaterialKind;
  title: string;
  type: CourseMaterialType; // for files; LINK for links
  url?: string;
  file?: File;
}

interface AddMaterialModalProps {
  onClose: () => void;
  onSubmit: (data: AddMaterialFormData) => void;
  isSubmitting: boolean;
  error: string | null;
}

const ACCEPT_BY_TYPE: Record<CourseMaterialType, string> = {
  PDF: 'application/pdf,.pdf',
  VIDEO: 'video/*',
  FILE: '',
  LINK: '',
};

export function AddMaterialModal({
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: AddMaterialModalProps) {
  const [kind, setKind] = useState<AddMaterialKind>('FILE');
  const [type, setType] = useState<CourseMaterialType>('PDF');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState('');

  const accept = useMemo(() => ACCEPT_BY_TYPE[type] ?? '', [type]);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isSubmitting, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();

    if (kind === 'LINK') {
      const u = url.trim();
      if (!trimmedTitle) {
        setValidationError('Title is required');
        return;
      }
      if (!u) {
        setValidationError('URL is required');
        return;
      }
      setValidationError('');
      onSubmit({ kind, type: 'LINK', title: trimmedTitle, url: u });
      return;
    }

    if (!file) {
      setValidationError('Choose a file');
      return;
    }
    setValidationError('');
    onSubmit({
      kind,
      type,
      title: trimmedTitle,
      file,
    });
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-white/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">
            Add lecture material
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 disabled:opacity-60"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setKind('FILE')}
              disabled={isSubmitting}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                kind === 'FILE'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setKind('LINK')}
              disabled={isSubmitting}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                kind === 'LINK'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Add link
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              placeholder={kind === 'LINK' ? 'e.g. Lecture 1 recording' : 'Optional (defaults to filename)'}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-300"
            />
          </label>

          {kind === 'LINK' ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">URL</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isSubmitting}
                placeholder="https://..."
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-300"
              />
              <p className="text-[11px] text-slate-500">
                YouTube links will embed; other links will open externally.
              </p>
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">
                  File type
                </span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as CourseMaterialType)}
                  disabled={isSubmitting}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-300"
                >
                  <option value="PDF">PDF</option>
                  <option value="VIDEO">Video</option>
                  <option value="FILE">Other file</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">File</span>
                <input
                  type="file"
                  accept={accept}
                  disabled={isSubmitting}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-800"
                />
              </label>
            </>
          )}

          {(validationError || error) && (
            <p className="text-sm text-red-600">{validationError || error}</p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
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
              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Add material'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

