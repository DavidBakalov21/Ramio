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

  const isClickable = !!onAssignmentClick;

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
          className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 ${
            a.submitted
              ? 'border-l-4 border-l-green-500 border-green-200 bg-green-50'
              : 'border-slate-200 bg-white'
          } ${isClickable ? 'cursor-pointer transition hover:border-slate-300 hover:bg-slate-50/50' : ''} ${
            a.submitted && isClickable ? 'hover:border-green-300 hover:bg-green-100/50' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            {a.submitted && (
              <span
                className="shrink-0 rounded-full bg-green-500/20 p-1"
                title="Submitted"
                aria-hidden
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 text-green-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
            <div>
            <p className="font-medium text-slate-900">{a.title}</p>
            {a.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{a.description}</p>
            )}
            <p className={`mt-1 text-[11px] ${a.submitted ? 'text-green-700' : 'text-slate-400'}`}>
              {a.points} pts · {getAssignmentLanguageLabel(a.language)}
              {a.dueDate && ` · Due ${new Date(a.dueDate).toLocaleDateString()}`}
              {a.submitted && (
                <span className="ml-1.5 font-medium text-green-600">· Submitted</span>
              )}
            </p>
            </div>
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
