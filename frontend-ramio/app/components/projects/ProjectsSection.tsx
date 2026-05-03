'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { CourseProject } from '@/app/interfaces/Project';
import { ProjectList } from './ProjectList';

interface ProjectsSectionProps {
  courseId: string;
  isTeacher: boolean;
}

export function ProjectsSection({ courseId, isTeacher }: ProjectsSectionProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<CourseProject[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <section className="mb-8 flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
        {isTeacher && (
          <button
            type="button"
            onClick={() => router.push(`/courses/${courseId}/project/new`)}
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
          if (isTeacher) router.push(`/courses/${courseId}/project/${project.id}/edit`);
          else router.push(`/courses/${courseId}/project/${project.id}`);
        }}
      />
    </section>
  );
}
