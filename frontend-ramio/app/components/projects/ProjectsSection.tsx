'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { CourseProject } from '@/app/interfaces/Project';
import { useToast } from '@/app/components/utility/toast';
import { ProjectList } from './ProjectList';
import { AddProjectModal, AddProjectFormData } from './AddProjectModal';
import { EditProjectModal, EditProjectFormData } from './EditProjectModal';

interface ProjectsSectionProps {
  courseId: string;
  isTeacher: boolean;
}

export function ProjectsSection({ courseId, isTeacher }: ProjectsSectionProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<CourseProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<CourseProject | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<CourseProject[]>(`/project/course/${courseId}`);
      setProjects(res.data);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const closeModal = useCallback(() => {
    if (submitting) return;
    setModalOpen(false);
    setError(null);
  }, [submitting]);

  const openEditModal = useCallback((project: CourseProject) => {
    setSelectedProject(project);
    setEditModalOpen(true);
    setEditError(null);
  }, []);

  const closeEditModal = useCallback(() => {
    if (editSubmitting) return;
    setEditModalOpen(false);
    setSelectedProject(null);
    setEditError(null);
  }, [editSubmitting]);

  const handleDelete = useCallback(
    async (projectId: string) => {
      setEditError(null);
      try {
        await api.delete(`/project/${projectId}`);
        await fetchProjects();
        closeEditModal();
        showToast('Project deleted.', 'success');
      } catch (err: unknown) {
        const res = (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
        const msg = Array.isArray(res) ? res[0] : typeof res === 'string' ? res : 'Failed to delete';
        setEditError(msg);
        showToast(msg, 'error');
      }
    },
    [fetchProjects, closeEditModal, showToast],
  );

  const handleCreate = useCallback(
    async (data: AddProjectFormData) => {
      setError(null);
      setSubmitting(true);
      try {
        const dueDateSeconds = data.dueDate
          ? Math.floor(new Date(data.dueDate).getTime() / 1000)
          : undefined;
        await api.post<CourseProject>('/project', {
          title: data.title,
          description: data.description || undefined,
          points: data.points,
          dueDate: dueDateSeconds,
          assessmentPrompt: data.assessmentPrompt || undefined,
          courseId: Number(courseId),
        });
        await fetchProjects();
        setModalOpen(false);
        showToast('Project created.', 'success');
      } catch (err: unknown) {
        const res = (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
        const msg = Array.isArray(res) ? res[0] : typeof res === 'string' ? res : 'Failed to create project';
        setError(msg);
        showToast(msg, 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [courseId, fetchProjects, showToast],
  );

  const handleEdit = useCallback(
    async (data: EditProjectFormData) => {
      if (!selectedProject) return;
      setEditError(null);
      setEditSubmitting(true);
      try {
        const dueDateSeconds = data.dueDate
          ? Math.floor(new Date(data.dueDate).getTime() / 1000)
          : null;
        await api.patch(`/project/${selectedProject.id}`, {
          title: data.title,
          description: data.description || undefined,
          points: data.points,
          dueDate: dueDateSeconds,
          assessmentPrompt: data.assessmentPrompt || null,
        });
        await fetchProjects();
        closeEditModal();
        showToast('Project updated.', 'success');
      } catch (err: unknown) {
        const res = (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message;
        const msg = Array.isArray(res) ? res[0] : typeof res === 'string' ? res : 'Failed to save';
        setEditError(msg);
        showToast(msg, 'error');
      } finally {
        setEditSubmitting(false);
      }
    },
    [selectedProject, fetchProjects, closeEditModal, showToast],
  );

  return (
    <section className="mb-8 flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
        {isTeacher && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-full bg-amber-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-800"
          >
            Add
          </button>
        )}
      </div>

      <ProjectList
        projects={projects}
        isLoading={loading}
        emptyMessage={
          isTeacher ? (
            <>
              No projects yet.
              {' Use "Add" to create one.'}
            </>
          ) : (
            'No projects yet.'
          )
        }
        onProjectClick={(project) => {
          if (isTeacher) openEditModal(project);
          else router.push(`/courses/${courseId}/project/${project.id}`);
        }}
      />

      <EditProjectModal
        isOpen={editModalOpen}
        project={selectedProject}
        onClose={closeEditModal}
        onSubmit={handleEdit}
        onDelete={isTeacher ? handleDelete : undefined}
        isSubmitting={editSubmitting}
        error={editError}
      />

      <AddProjectModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSubmit={handleCreate}
        isSubmitting={submitting}
        error={error}
      />
    </section>
  );
}
