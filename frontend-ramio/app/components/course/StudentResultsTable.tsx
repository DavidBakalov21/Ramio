'use client';

import { useRouter } from 'next/navigation';
import {
  type ResultCell,
  type StudentResultsResponse,
} from '@/app/interfaces/StudentResults';

interface StudentResultsTableProps {
  data: StudentResultsResponse | null;
  loading: boolean;
  onKick?: (userId: string) => Promise<void>;
  kickingId?: string | null;
}

export function StudentResultsTable({
  data,
  loading,
  onKick,
  kickingId,
}: StudentResultsTableProps) {
  const router = useRouter();
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

  const { assignments, projects, students } = data;
  const projectsList = projects ?? [];
  const quizzesList = data.quizzes ?? [];

  const renderCell = (r: ResultCell) =>
    r ? (
      <span
        className={r.isChecked ? 'text-slate-900' : 'text-amber-700'}
        title={r.isChecked ? 'Assessed' : 'Not yet assessed'}
      >
        {r.points}
        {!r.isChecked && <span className="ml-0.5 text-amber-500">*</span>}
      </span>
    ) : (
      <span className="text-slate-400">-</span>
    );

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
            {projectsList.map((p, idx) => (
              <th
                key={p.id}
                className={`px-3 py-3 font-medium text-slate-700 ${
                  idx === 0 ? 'border-l-2 border-l-amber-300/80' : ''
                }`}
                title={`${p.title} (project)`}
              >
                <span className="block truncate max-w-[120px]" title={p.title}>
                  {p.title}
                </span>
                <span className="text-xs font-normal text-amber-700/90">
                  project · /{p.maxPoints}
                </span>
              </th>
            ))}
            {quizzesList.map((q, idx) => (
              <th
                key={q.id}
                className={`px-3 py-3 font-medium text-slate-700 ${
                  idx === 0 ? 'border-l-2 border-l-violet-300/80' : ''
                }`}
                title={`${q.title} (test)`}
              >
                <span className="block truncate max-w-[120px]" title={q.title}>
                  {q.title}
                </span>
                <span className="text-xs font-normal text-violet-600/90">
                  test · /{q.maxPoints}
                </span>
              </th>
            ))}
            <th className="px-4 py-3 font-semibold text-slate-900">Total</th>
            {onKick && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const pct =
              s.totalMax > 0
                ? Math.round((s.totalEarned / s.totalMax) * 100)
                : 0;
            const projectResults = s.projectResults ?? [];
            return (
              <tr
                key={s.userId}
                className="border-b border-slate-100 transition hover:bg-slate-50/50"
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/users/${s.userId}`)}
                    className="text-left hover:opacity-75 transition-opacity"
                  >
                    <p className="font-medium text-slate-900 hover:text-violet-600">
                      {s.username || s.email}
                    </p>
                    {s.username && (
                      <p className="text-xs text-slate-500">{s.email}</p>
                    )}
                  </button>
                </td>
                {assignments.map((a, idx) => {
                  const r = s.assignmentResults?.[idx] ?? null;
                  return (
                    <td key={a.id} className="px-3 py-3 text-slate-700">
                      {renderCell(r)}
                    </td>
                  );
                })}
                {projectsList.map((p, idx) => {
                  const r = projectResults[idx] ?? null;
                  return (
                    <td
                      key={p.id}
                      className={`px-3 py-3 text-slate-700 ${
                        idx === 0 ? 'border-l-2 border-l-amber-200/90' : ''
                      }`}
                    >
                      {renderCell(r)}
                    </td>
                  );
                })}
                {quizzesList.map((q, idx) => {
                  const r = (s.quizResults ?? [])[idx] ?? null;
                  return (
                    <td
                      key={q.id}
                      className={`px-3 py-3 text-slate-700 ${
                        idx === 0 ? 'border-l-2 border-l-violet-200/90' : ''
                      }`}
                    >
                      {renderCell(r)}
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
                {onKick && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void onKick(s.userId)}
                      disabled={kickingId === s.userId}
                      className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 hover:border-red-300 disabled:opacity-50"
                    >
                      {kickingId === s.userId ? 'Removing…' : 'Kick'}
                    </button>
                  </td>
                )}
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
