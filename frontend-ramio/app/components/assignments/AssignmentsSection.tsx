'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { Assignment } from '@/app/interfaces/Assignment';
import {
  getAssignmentLanguageFileExtension,
} from '@/app/constants/assignmentLanguages';
import { AssignmentList } from './AssignmentList';
import { AddAssignmentModal, AddAssignmentFormData } from './AddAssignmentModal';
import {
  EditAssignmentModal,
  EditAssignmentFormData,
} from './EditAssignmentModal';

interface AssignmentsSectionProps {
  courseId: string;
  isTeacher: boolean;
}

export function AssignmentsSection({ courseId, isTeacher }: AssignmentsSectionProps) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Assignment[]>(`/assignment/course/${courseId}`);
      setAssignments(res.data);
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const closeModal = useCallback(() => {
    if (submitting) return;
    setModalOpen(false);
    setError(null);
  }, [submitting]);

  const openEditModal = useCallback((assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setEditModalOpen(true);
    setEditError(null);
  }, []);

  const closeEditModal = useCallback(() => {
    if (editSubmitting) return;
    setEditModalOpen(false);
    setSelectedAssignment(null);
    setEditError(null);
  }, [editSubmitting]);

  const handleDelete = useCallback(
    async (assignmentId: string) => {
      setEditError(null);
      try {
        await api.delete(`/assignment/${assignmentId}`);
        await fetchAssignments();
        closeEditModal();
      } catch (err: unknown) {
        const res = (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
        setEditError(
          Array.isArray(res) ? res[0] : typeof res === 'string' ? res : 'Failed to delete',
        );
      }
    },
    [fetchAssignments, closeEditModal],
  );

  const handleCreate = useCallback(
    async (data: AddAssignmentFormData) => {
      setError(null);
      setSubmitting(true);
      try {
        const createRes = await api.post<Assignment>('/assignment', {
          title: data.title,
          description: data.description || undefined,
          points: data.points,
          language: data.language,
          courseId: Number(courseId),
        });
        const newId = createRes.data.id;
        if (data.testCode) {
          const ext = getAssignmentLanguageFileExtension(data.language);
          const file = new File([data.testCode], `test.${ext}`, {
            type: ext === 'js' ? 'text/javascript' : 'text/x-python',
          });
          const formData = new FormData();
          formData.append('file', file);
          await api.post(`/assignment/${newId}/test-file`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
        await fetchAssignments();
        setModalOpen(false);
      } catch (err: unknown) {
        const res = (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
        setError(
          Array.isArray(res) ? res[0] : typeof res === 'string' ? res : 'Failed to create assignment',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [courseId, fetchAssignments],
  );

  const handleEdit = useCallback(
    async (data: EditAssignmentFormData) => {
      if (!selectedAssignment) return;
      setEditError(null);
      setEditSubmitting(true);
      try {
        const dueDateSeconds = data.dueDate
          ? Math.floor(new Date(data.dueDate).getTime() / 1000)
          : null;
        await api.patch(`/assignment/${selectedAssignment.id}`, {
          title: data.title,
          description: data.description || undefined,
          points: data.points,
          language: data.language,
          dueDate: dueDateSeconds,
        });
        if (data.newTestFile) {
          const formData = new FormData();
          formData.append('file', data.newTestFile);
          await api.post(
            `/assignment/${selectedAssignment.id}/test-file`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } },
          );
        } else if (data.newTestCode) {
          const ext = getAssignmentLanguageFileExtension(data.language);
          const file = new File([data.newTestCode], `test.${ext}`, {
            type: ext === 'js' ? 'text/javascript' : 'text/x-python',
          });
          const formData = new FormData();
          formData.append('file', file);
          await api.post(
            `/assignment/${selectedAssignment.id}/test-file`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } },
          );
        }
        await fetchAssignments();
        closeEditModal();
      } catch (err: unknown) {
        const res = (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
        setEditError(
          Array.isArray(res) ? res[0] : typeof res === 'string' ? res : 'Failed to save',
        );
      } finally {
        setEditSubmitting(false);
      }
    },
    [selectedAssignment, fetchAssignments, closeEditModal],
  );

  return (
    <section className="mb-8 flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Assignments</h2>
        {isTeacher && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
          >
            Add
          </button>
        )}
      </div>

      <AssignmentList
        assignments={assignments}
        isLoading={loading}
        emptyMessage={
          isTeacher ? (
            <>
              No assignments yet.
              {' Use "Add" to create one.'}
            </>
          ) : (
            'No assignments yet.'
          )
        }
        isTeacher={isTeacher}
        onAssignmentClick={(assignment) => {
          if (isTeacher) openEditModal(assignment);
          else router.push(`/courses/${courseId}/assignment/${assignment.id}`);
        }}
      />

      <EditAssignmentModal
        isOpen={editModalOpen}
        assignment={selectedAssignment}
        onClose={closeEditModal}
        onSubmit={handleEdit}
        onDelete={isTeacher ? handleDelete : undefined}
        isSubmitting={editSubmitting}
        error={editError}
      />

      <AddAssignmentModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSubmit={handleCreate}
        isSubmitting={submitting}
        error={error}
      />
    </section>
  );
}
