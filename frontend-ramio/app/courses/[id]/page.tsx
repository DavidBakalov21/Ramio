'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { User } from '../../interfaces/User';
import { Course } from '../../interfaces/Course';
import { Assignment } from '../../interfaces/Assignment';

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [addAssignmentTitle, setAddAssignmentTitle] = useState('');
  const [addAssignmentDescription, setAddAssignmentDescription] = useState('');
  const [addAssignmentSubmitting, setAddAssignmentSubmitting] = useState(false);
  const [addAssignmentError, setAddAssignmentError] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get<User>('/me');
        const currentUser = res.data;
        if (!currentUser.role || !currentUser.username) {
          router.push('/onboarding');
          return;
        }
        setUser(currentUser);
      } catch {
        router.push('/login');
      } finally {
        setLoadingUser(false);
      }
    };
    fetchUser();
  }, [router]);

  useEffect(() => {
    if (!courseId || !user?.role) return;
    const fetchCourse = async () => {
      setLoadingCourse(true);
      try {
        const res = await api.get<Course>(`/course/${courseId}`);
        setCourse(res.data);
      } catch {
        setCourse(null);
      } finally {
        setLoadingCourse(false);
      }
    };
    fetchCourse();
  }, [courseId, user?.role]);

  useEffect(() => {
    if (!courseId || !user?.role) return;
    const fetchAssignments = async () => {
      setLoadingAssignments(true);
      try {
        const res = await api.get<Assignment[]>(`/assignment/course/${courseId}`);
        setAssignments(res.data);
      } catch {
        setAssignments([]);
      } finally {
        setLoadingAssignments(false);
      }
    };
    fetchAssignments();
  }, [courseId, user?.role]);

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = addAssignmentTitle.trim();
    if (!title) {
      setAddAssignmentError('Title is required');
      return;
    }
    setAddAssignmentError('');
    setAddAssignmentSubmitting(true);
    try {
      await api.post('/assignment', {
        title,
        description: addAssignmentDescription.trim() || undefined,
        courseId: Number(courseId),
      });
      const res = await api.get<Assignment[]>(`/assignment/course/${courseId}`);
      setAssignments(res.data);
      setShowAddAssignment(false);
      setAddAssignmentTitle('');
      setAddAssignmentDescription('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setAddAssignmentError(msg || 'Failed to create assignment');
    } finally {
      setAddAssignmentSubmitting(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    );
  }
  if (!user) return null;

  if (loadingCourse || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        {loadingCourse ? (
          <div className="text-sm text-slate-500">Loading course...</div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-slate-600">Course not found or you don’t have access.</p>
            <button
              type="button"
              onClick={() => router.push('/courses')}
              className="mt-3 text-sm font-medium text-violet-600 hover:underline"
            >
              Back to all courses
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-4">
      <main className="relative flex w-full max-w-4xl flex-col rounded-[1.9rem] bg-white/85 p-6 pb-7 shadow-xl backdrop-blur-sm ring-1 ring-white/60 min-h-[80vh]">
        <header className="mb-6 flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push('/courses')}
            className="self-start text-xs font-medium text-slate-500 transition hover:text-slate-700"
          >
            ← Back to courses
          </button>
          <h1 className="text-xl font-semibold text-slate-900">{course.title}</h1>
          {course.description && (
            <p className="text-sm text-slate-500">{course.description}</p>
          )}
          <p className="text-xs text-slate-400">
            {course.teacherName} · {course.enrollmentCount} enrolled · {course.assignmentCount} assignments
          </p>
        </header>

        {/* Assignments */}
        <section className="mb-8 flex w-full flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Assignments</h2>
            {course.isTeacher && (
              <button
                type="button"
                onClick={() => setShowAddAssignment(true)}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
              >
                Add
              </button>
            )}
          </div>

          {showAddAssignment && (
            <form
              onSubmit={handleAddAssignment}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3"
            >
              <input
                type="text"
                value={addAssignmentTitle}
                onChange={(e) => setAddAssignmentTitle(e.target.value)}
                placeholder="Assignment title"
                maxLength={255}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
              <textarea
                value={addAssignmentDescription}
                onChange={(e) => setAddAssignmentDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                maxLength={2000}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
              {addAssignmentError && (
                <p className="text-xs text-red-600">{addAssignmentError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addAssignmentSubmitting}
                  className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {addAssignmentSubmitting ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddAssignment(false);
                    setAddAssignmentError('');
                    setAddAssignmentTitle('');
                    setAddAssignmentDescription('');
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loadingAssignments ? (
            <p className="text-sm text-slate-500">Loading assignments…</p>
          ) : assignments.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
              No assignments yet.
              {course.isTeacher && ' Use "Add" to create one.'}
            </div>
          ) : (
            <ul className="space-y-2">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{a.title}</p>
                    {a.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{a.description}</p>
                    )}
                    {a.dueDate && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Due {new Date(a.dueDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Lecture materials */}
        <section className="flex w-full flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Lecture materials</h2>
            {course.isTeacher && (
              <button
                type="button"
                className="rounded-full border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
              >
                Add
              </button>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
            No lecture materials yet.
            {course.isTeacher && ' Use "Add" to upload slides or links (coming soon).'}
          </div>
        </section>
      </main>
    </div>
  );
}
