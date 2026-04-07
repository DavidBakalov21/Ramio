'use client';

import { CourseProject } from '@/app/interfaces/Project';

interface ProjectListProps {
  projects: CourseProject[];
  isLoading: boolean;
  emptyMessage?: React.ReactNode;
  onProjectClick?: (project: CourseProject) => void;
}

export function ProjectList({
  projects,
  isLoading,
  emptyMessage,
  onProjectClick,
}: ProjectListProps) {
  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading projects…</p>;
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
        {emptyMessage ?? 'No projects yet.'}
      </div>
    );
  }

  const isClickable = !!onProjectClick;

  return (
    <ul className="space-y-2">
      {projects.map((p) => (
        <li
          key={p.id}
          role={isClickable ? 'button' : undefined}
          tabIndex={isClickable ? 0 : undefined}
          onClick={isClickable ? () => onProjectClick(p) : undefined}
          onKeyDown={
            isClickable
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onProjectClick(p);
                  }
                }
              : undefined
          }
          className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 ${
            p.submitted
              ? 'border-l-4 border-l-amber-500 border-amber-200 bg-amber-50/60'
              : 'border-slate-200 bg-white'
          } ${isClickable ? 'cursor-pointer transition hover:border-slate-300 hover:bg-slate-50/50' : ''} ${
            p.submitted && isClickable ? 'hover:border-amber-300 hover:bg-amber-50/80' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            {p.submitted && (
              <span
                className="shrink-0 rounded-full bg-amber-500/20 p-1"
                title="Submitted"
                aria-hidden
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 text-amber-700"
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
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-900">{p.title}</p>
                <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Project
                </span>
              </div>
              {p.description && (
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{p.description}</p>
              )}
              <p className={`mt-1 text-[11px] ${p.submitted ? 'text-amber-800' : 'text-slate-400'}`}>
                {p.points} pts
                {p.dueDate && ` · Due ${new Date(p.dueDate).toLocaleDateString()}`}
                {p.submitted && (
                  <span className="ml-1.5 font-medium text-amber-700">
                    · {p.isChecked ? 'Assessed' : 'Submitted'}
                  </span>
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
