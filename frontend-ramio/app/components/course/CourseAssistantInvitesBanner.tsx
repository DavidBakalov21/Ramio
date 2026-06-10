'use client';

import { useRouter } from 'next/navigation';
import { MyCourseAssistantInvite } from '@/app/interfaces/Course';

interface CourseAssistantInvitesBannerProps {
  invites: MyCourseAssistantInvite[];
  actingId: string | null;
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
}

export function CourseAssistantInvitesBanner({
  invites,
  actingId,
  onAccept,
  onDecline,
}: CourseAssistantInvitesBannerProps) {
  const router = useRouter();

  if (invites.length === 0) return null;

  return (
    <section className="mb-6 w-full rounded-2xl border border-violet-200 bg-violet-50/80 p-4">
      <h2 className="text-sm font-semibold text-violet-900">
        Course assistant invites
      </h2>
      <p className="mt-1 text-xs text-violet-700">
        You have been invited to help manage courses as an assistant.
      </p>
      <ul className="mt-3 space-y-2">
        {invites.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-col gap-2 rounded-xl border border-violet-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <button
                type="button"
                onClick={() => router.push(`/courses/${invite.courseId}`)}
                className="text-left font-medium text-slate-900 hover:text-violet-600"
              >
                {invite.courseTitle}
              </button>
              <p className="text-xs text-slate-500">
                Invited by {invite.inviterName} ·{' '}
                {new Date(invite.invitedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDecline(invite.id)}
                disabled={actingId === invite.id}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => onAccept(invite.id)}
                disabled={actingId === invite.id}
                className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
              >
                {actingId === invite.id ? '…' : 'Accept'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
