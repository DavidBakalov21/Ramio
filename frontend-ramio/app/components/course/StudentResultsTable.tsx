'use client';

import { StudentResultsResponse } from '@/app/interfaces/StudentResults';

interface StudentResultsTableProps {
  data: StudentResultsResponse | null;
  loading: boolean;
}

export function StudentResultsTable({ data, loading }: StudentResultsTableProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
        Loading results…
      </div>
    );
  }

  if (!data || data.students.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
        No enrolled students yet.
      </div>
    );
  }

  const { assignments, students } = data;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[500px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            <th className="px-4 py-3 font-semibold text-slate-900">Student</th>
            {assignments.map((a) => (
              <th
                key={a.id}
                className="px-3 py-3 font-medium text-slate-700"
                title={a.title}
              >
                <span className="block truncate max-w-[120px]" title={a.title}>
                  {a.title}
                </span>
                <span className="text-xs font-normal text-slate-500">
                  /{a.maxPoints}
                </span>
              </th>
            ))}
            <th className="px-4 py-3 font-semibold text-slate-900">Total</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const pct =
              s.totalMax > 0
                ? Math.round((s.totalEarned / s.totalMax) * 100)
                : 0;
            return (
              <tr
                key={s.userId}
                className="border-b border-slate-100 transition hover:bg-slate-50/50"
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {s.username || s.email}
                    </p>
                    {s.username && (
                      <p className="text-xs text-slate-500">{s.email}</p>
                    )}
                  </div>
                </td>
                {assignments.map((a, idx) => {
                  const r = s.assignmentResults?.[idx] ?? null;
                  return (
                    <td key={a.id} className="px-3 py-3 text-slate-700">
                      {r ? (
                        <span
                          className={
                            r.isChecked
                              ? 'text-slate-900'
                              : 'text-amber-700'
                          }
                          title={r.isChecked ? 'Assessed' : 'Not yet assessed'}
                        >
                          {r.points}
                          {!r.isChecked && (
                            <span className="ml-0.5 text-amber-500">*</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-900">
                    {s.totalEarned}
                  </span>
                  <span className="text-slate-500"> / {s.totalMax}</span>
                  {s.totalMax > 0 && (
                    <span className="ml-1.5 text-xs text-slate-500">
                      ({pct}%)
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        * Not yet assessed
      </p>
    </div>
  );
}
