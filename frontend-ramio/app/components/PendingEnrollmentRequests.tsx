'use client';

import { PendingEnrollmentRequest } from '../interfaces/Course';

interface PendingEnrollmentRequestsProps {
  requests: PendingEnrollmentRequest[];
  loading: boolean;
  actingId: string | null;
  onAccept: (pendingId: string) => void;
  onDecline: (pendingId: string) => void;
}

export function PendingEnrollmentRequests({
  requests,
  loading,
  actingId,
  onAccept,
  onDecline,
}: PendingEnrollmentRequestsProps) {
  return (
    <section className="mb-8 flex w-full flex-col gap-3">
      <h2 className="text-lg font-semibold text-slate-900">Enrollment requests</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading requests…</p>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
          No pending enrollment requests.
        </div>
      ) : (
        <ul className="space-y-2">
          {requests.map((req) => (
            <li
              key={req.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {req.username || req.email}
                </p>
                {req.username && (
                  <p className="text-xs text-slate-500">{req.email}</p>
                )}
                <p className="mt-1 text-[11px] text-slate-400">
                  Requested {new Date(req.requestedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onDecline(req.id)}
                  disabled={actingId === req.id}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => onAccept(req.id)}
                  disabled={actingId === req.id}
                  className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
                >
                  {actingId === req.id ? '…' : 'Accept'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
