'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import {
  CourseAssistantsResponse,
  PendingCourseAssistantInvite,
  CourseAssistant,
} from '@/app/interfaces/Course';
import { useToast } from '@/app/components/utility/toast';

interface CourseAssistantsSectionProps {
  courseId: string;
  data: CourseAssistantsResponse | null;
  loading: boolean;
  onUpdated: () => void;
}

export function CourseAssistantsSection({
  courseId,
  data,
  loading,
  onUpdated,
}: CourseAssistantsSectionProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setInviting(true);
    try {
      await api.post(`/course/${courseId}/assistants/invite`, {
        email: trimmed,
      });
      setEmail('');
      showToast('Assistant invite sent.', 'success');
      onUpdated();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      showToast((msg as string) || 'Failed to send invite.', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveAssistant = async (userId: string) => {
    setActingId(userId);
    try {
      await api.delete(`/course/${courseId}/assistants/${userId}`);
      showToast('Assistant removed.', 'success');
      onUpdated();
    } catch {
      showToast('Failed to remove assistant.', 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    setActingId(inviteId);
    try {
      await api.delete(`/course/${courseId}/assistants/pending/${inviteId}`);
      showToast('Invite cancelled.', 'success');
      onUpdated();
    } catch {
      showToast('Failed to cancel invite.', 'error');
    } finally {
      setActingId(null);
    }
  };

  const renderPerson = (
    person: CourseAssistant | PendingCourseAssistantInvite,
    actions: React.ReactNode,
  ) => (
    <li
      key={'joinedAt' in person ? person.userId : person.id}
      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
    >
      <button
        type="button"
        onClick={() => router.push(`/users/${person.userId}`)}
        className="text-left hover:opacity-75 transition-opacity"
      >
        <p className="font-medium text-slate-900 hover:text-violet-600">
          {person.username || person.email}
        </p>
        {person.username && (
          <p className="text-xs text-slate-500">{person.email}</p>
        )}
      </button>
      {actions}
    </li>
  );

  return (
    <section className="mb-8 flex w-full flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Assistants</h2>
        <p className="mt-1 text-sm text-slate-500">
          Invite another teacher to help manage this course. Assistants can do
          everything you can, except delete the course.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleInvite(e)}
        className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Teacher email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@university.edu"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-violet-200 focus:ring-2"
            disabled={inviting}
          />
        </label>
        <button
          type="submit"
          disabled={inviting || !email.trim()}
          className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
        >
          {inviting ? 'Sending…' : 'Send invite'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">Loading assistants…</p>
      ) : (
        <>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">
              Active assistants
            </h3>
            {!data?.assistants.length ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
                No assistants yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {data.assistants.map((assistant) =>
                  renderPerson(
                    assistant,
                    <button
                      type="button"
                      onClick={() => void handleRemoveAssistant(assistant.userId)}
                      disabled={actingId === assistant.userId}
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      {actingId === assistant.userId ? '…' : 'Remove'}
                    </button>,
                  ),
                )}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">
              Pending invites
            </h3>
            {!data?.pendingInvites.length ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
                No pending invites.
              </div>
            ) : (
              <ul className="space-y-2">
                {data.pendingInvites.map((invite) =>
                  renderPerson(
                    invite,
                    <button
                      type="button"
                      onClick={() => void handleCancelInvite(invite.id)}
                      disabled={actingId === invite.id}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      {actingId === invite.id ? '…' : 'Cancel'}
                    </button>,
                  ),
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
