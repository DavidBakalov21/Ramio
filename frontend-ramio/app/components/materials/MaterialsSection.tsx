'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import type { CourseMaterial, CourseMaterialType } from '@/app/interfaces/Material';
import { AddMaterialModal, type AddMaterialFormData } from './AddMaterialModal';
import { useToast } from '@/app/components/utility/toast';
import {
  FileText,
  File,
  Video,
  Globe,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface MaterialsSectionProps {
  courseId: string;
  isTeacher: boolean;
}

function IconForType({ type }: { type: CourseMaterialType }) {
  const cls = 'h-4 w-4 text-slate-500';
  if (type === 'PDF') return <FileText className={cls} />;
  if (type === 'VIDEO') return <Video className={cls} />;
  if (type === 'LINK') return <Globe className={cls} />;
  return <File className={cls} />;
}

export function MaterialsSection({ courseId, isTeacher }: MaterialsSectionProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<CourseMaterial[]>(`/course/${courseId}/materials`);
      setMaterials(res.data);
    } catch {
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void fetchMaterials();
  }, [fetchMaterials]);

  const closeModal = useCallback(() => {
    if (submitting) return;
    setModalOpen(false);
    setError(null);
  }, [submitting]);

  const handleSubmit = useCallback(
    async (data: AddMaterialFormData) => {
      setSubmitting(true);
      setError(null);
      try {
        if (data.kind === 'LINK') {
          await api.post(`/course/${courseId}/materials/link`, {
            title: data.title,
            url: data.url,
          });
        } else {
          const fd = new FormData();
          if (data.file) fd.append('file', data.file);
          if (data.title) fd.append('title', data.title);
          if (data.type) fd.append('type', data.type);
          await api.post(`/course/${courseId}/materials/file`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
        await fetchMaterials();
        closeModal();
        showToast('Material added.', 'success');
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string | string[] } } })
            ?.response?.data?.message;
        const resolved =
          Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to add material';
        setError(resolved);
        showToast(resolved, 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [courseId, fetchMaterials, closeModal, showToast],
  );

  const handleDelete = useCallback(
    async (materialId: string) => {
      if (!isTeacher) return;
      setDeletingId(materialId);
      try {
        await api.delete(`/course/${courseId}/materials/${materialId}`);
        setMaterials((prev) => prev.filter((m) => m.id !== materialId));
        showToast('Material deleted.', 'success');
      } catch {
        showToast('Failed to delete material.', 'error');
      } finally {
        setDeletingId(null);
      }
    },
    [courseId, isTeacher, showToast],
  );

  const emptyState = useMemo(() => {
    if (loading) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
          Loading materials…
        </div>
      );
    }
    if (!materials.length) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
          No lecture materials yet.
          {isTeacher && ' Use “Add” to upload files or share links.'}
        </div>
      );
    }
    return null;
  }, [loading, materials.length, isTeacher]);

  return (
    <section className="mb-8 flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Lecture materials</h2>
        {isTeacher && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-full border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
          >
            Add
          </button>
        )}
      </div>

      {emptyState}

      {!!materials.length && (
        <ul className="flex flex-col gap-2">
          {materials.map((m) => (
            <li
              key={m.id}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-violet-200"
            >
              <button
                type="button"
                onClick={() => router.push(`/courses/${courseId}/materials/${m.id}`)}
                className="flex flex-1 items-center gap-3 text-left"
                title="Open material"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-50">
                  <IconForType type={m.type} />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900">
                    {m.title}
                  </span>
                  <span className="text-xs text-slate-500">
                    {m.type === 'LINK'
                      ? 'Link'
                      : m.type === 'PDF'
                        ? 'PDF'
                        : m.type === 'VIDEO'
                          ? 'Video'
                          : 'File'}
                    {m.name ? ` · ${m.name}` : ''}
                  </span>
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/courses/${courseId}/materials/${m.id}`)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <span className="inline-flex items-center gap-1">
                    View <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                </button>
                {isTeacher && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(m.id)}
                    disabled={deletingId === m.id}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                    title="Delete material"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingId === m.id ? 'Deleting…' : 'Delete'}
                    </span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <AddMaterialModal
          onClose={closeModal}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
          error={error}
        />
      )}
    </section>
  );
}

