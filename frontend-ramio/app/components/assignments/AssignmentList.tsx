'use client';

import { Assignment } from '@/app/interfaces/Assignment';
import { getAssignmentLanguageLabel } from '@/app/constants/assignmentLanguages';

interface AssignmentListProps {
  assignments: Assignment[];
  isLoading: boolean;
  emptyMessage?: React.ReactNode;
  isTeacher?: boolean;
  onAssignmentClick?: (assignment: Assignment) => void;
}

export function AssignmentList({
  assignments,
  isLoading,
  emptyMessage,
  isTeacher,
  onAssignmentClick,
}: AssignmentListProps) {
  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading assignments…</p>;
  }

  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
        {emptyMessage ?? 'No assignments yet.'}
      </div>
    );
  }

  const isClickable = isTeacher && onAssignmentClick;

  return (
    <ul className="space-y-2">
      {assignments.map((a) => (
        <li
          key={a.id}
          role={isClickable ? 'button' : undefined}
          tabIndex={isClickable ? 0 : undefined}
          onClick={isClickable ? () => onAssignmentClick(a) : undefined}
          onKeyDown={
            isClickable
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onAssignmentClick(a);
                  }
                }
              : undefined
          }
          className={`flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 ${
            isClickable
              ? 'cursor-pointer transition hover:border-slate-300 hover:bg-slate-50/50'
              : ''
          }`}
        >
          <div>
            <p className="font-medium text-slate-900">{a.title}</p>
            {a.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{a.description}</p>
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              {a.points} pts · {getAssignmentLanguageLabel(a.language)}
              {a.dueDate && ` · Due ${new Date(a.dueDate).toLocaleDateString()}`}
            </p>
          </div>
          {isClickable && (
            <span className="text-slate-400" aria-hidden>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
