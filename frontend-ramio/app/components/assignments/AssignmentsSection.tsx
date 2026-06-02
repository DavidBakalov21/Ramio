'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { Assignment } from '@/app/interfaces/Assignment';
import { AssignmentList } from './AssignmentList';

interface AssignmentsSectionProps {
  courseId: string;
  isTeacher: boolean;
}

export function AssignmentsSection({
  courseId,
  isTeacher,
}: AssignmentsSectionProps) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <section className="mb-8 flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Code Snippet Tasks</h2>
          <span className="text-sm text-slate-400">— simple and quick single file tasks</span>
        </div>
        {isTeacher && (
          <button
            type="button"
            onClick={() => router.push(`/courses/${courseId}/assignment/new`)}
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
              No code snippet tasks yet.
              {' Use "Add" to create one.'}
            </>
          ) : (
            'No code snippet tasks yet.'
          )
        }
        isTeacher={isTeacher}
        onAssignmentClick={(assignment) => {
          if (isTeacher)
            router.push(
              `/courses/${courseId}/assignment/${assignment.id}/edit`,
            );
          else router.push(`/courses/${courseId}/assignment/${assignment.id}`);
        }}
      />
    </section>
  );
}
