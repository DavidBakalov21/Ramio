'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useToast } from '@/app/components/utility/toast';
import { PROJECT_LANGUAGE_OPTIONS, ProjectLanguage } from '@/app/interfaces/Project';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';

export default function NewProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const courseId = params.id as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [courseAllowed, setCourseAllowed] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<ProjectLanguage>('PYTHON');
  const [points, setPoints] = useState(100);
  const [dueDate, setDueDate] = useState('');
  const [assessmentPrompt, setAssessmentPrompt] = useState('');

  useEffect(() => {
    if (!user?.role || !courseId) return;
    const checkCourseAccess = async () => {
      try {
        const res = await api.get<{ isTeacher: boolean }>(`/course/${courseId}`);
        setCourseAllowed(!!res.data.isTeacher);
      } catch {
        setCourseAllowed(false);
      }
    };
    void checkCourseAccess();
  }, [user?.role, courseId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const dueDateSeconds = dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : undefined;
      await api.post('/project', {
        title: trimmedTitle,
        description: description.trim() || undefined,
        points,
        language,
        dueDate: dueDateSeconds,
        assessmentPrompt: assessmentPrompt.trim() || undefined,
        courseId: Number(courseId),
      });
      showToast('Project created.', 'success');
      router.push(`/courses/${courseId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to create project.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingUser || courseAllowed === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  }
  if (!user) return null;
  if (!courseAllowed) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Only course teacher can create projects.</div>;
  }

  return (
    <TeacherPageShell user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
          <button
            type="button"
            onClick={() => router.push(`/courses/${courseId}`)}
            className="mb-3 self-start text-xs font-medium text-slate-500 transition hover:text-slate-700"
          >
            ← Back to course
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Create project</h1>
          <p className="mt-1 text-sm text-slate-500">Use this page to configure archive-based project tasks and grading notes.</p>

          <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Project title"
              maxLength={255}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What students should deliver"
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as ProjectLanguage)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {PROJECT_LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <textarea
              value={assessmentPrompt}
              onChange={(e) => setAssessmentPrompt(e.target.value)}
              placeholder="Assessment criteria / rubric notes for AI and teacher review"
              rows={8}
              maxLength={20000}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push(`/courses/${courseId}`)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-amber-700 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
              >
                {submitting ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </form>
    </TeacherPageShell>
  );
}

