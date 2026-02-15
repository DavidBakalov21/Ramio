'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { User } from '../interfaces/User';
import { Course, CoursePage } from '../interfaces/Course';

export default function AllCoursesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
        setIsLoadingUser(false);
      }
    };
    fetchUser();
  }, [router]);

  const fetchCourses = useCallback(async () => {
    if (!user?.role) return;
    setIsLoadingCourses(true);
    try {
      const res = await api.get<CoursePage>('/course/all', {
        params: { page, limit: 8 },
      });
      setCourses(res.data.items);
      setTotalPages(res.data.totalPages);
    } catch {
      setCourses([]);
      setTotalPages(1);
    } finally {
      setIsLoadingCourses(false);
    }
  }, [user?.role, page]);

  useEffect(() => {
    if (!user?.role) return;
    fetchCourses();
  }, [user?.role, page, fetchCourses]);

  useEffect(() => {
    if (!createModalOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCreateModal();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [createModalOpen]);

  const handleEnroll = async (courseId: string) => {
    setEnrollingId(courseId);
    try {
      await api.post(`/course/${courseId}/enroll`);
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, isEnrolled: true, enrollmentCount: c.enrollmentCount + 1 }
            : c,
        ),
      );
    } catch (err) {
      console.error('Enroll error:', err);
    } finally {
      setEnrollingId(null);
    }
  };

  const handleViewCourse = (courseId: string) => {
    router.push(`/courses/${courseId}`);
  };

  const handleEditCourse = (courseId: string) => {
    router.push(`/courses/${courseId}`);
  };

  const openCreateModal = () => {
    setCreateTitle('');
    setCreateDescription('');
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (!createSubmitting) {
      setCreateModalOpen(false);
      setCreateError(null);
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = createTitle.trim();
    if (!title) {
      setCreateError('Title is required');
      return;
    }
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      await api.post('/course', { title, description: createDescription.trim() || undefined });
      setCreateModalOpen(false);
      setCreateTitle('');
      setCreateDescription('');
      await fetchCourses();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
        : null;
      setCreateError(
        Array.isArray(message) ? message[0] : (typeof message === 'string' ? message : 'Failed to create course'),
      );
    } finally {
      setCreateSubmitting(false);
    }
  };

  if (isLoadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-4">
      <main className="relative flex w-full max-w-5xl flex-col items-center rounded-[1.9rem] bg-white/85 p-6 pb-7 shadow-xl backdrop-blur-sm ring-1 ring-white/60 min-h-[80vh]">
        <header className="mb-6 flex w-full items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="self-start text-xs font-medium text-slate-500 transition hover:text-slate-700"
            >
              ← Back to home
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                All courses
              </h1>
              <p className="text-xs text-slate-500">
                Browse every course in Ramio. Enroll as a student or edit your
                own courses as a teacher.
              </p>
            </div>
          </div>
          {user.role === 'TEACHER' && (
            <button
              type="button"
              onClick={openCreateModal}
              className="shrink-0 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              Create course
            </button>
          )}
        </header>

        <section className="flex w-full max-w-4xl flex-col items-center space-y-4">
          {isLoadingCourses ? (
            <p className="text-sm text-slate-500">Loading courses…</p>
          ) : courses.length === 0 ? (
            <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-500">
              No courses have been created yet.
            </div>
          ) : (
            <>
              <ul className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => (
                  <li
                    key={course.id}
                    className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-violet-200 hover:shadow-md"
                  >
                    <h3 className="line-clamp-1 text-sm font-semibold text-slate-900">
                      {course.title}
                    </h3>
                    {course.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {course.description}
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-slate-400">
                      {course.teacherName} · {course.enrollmentCount} enrolled ·{' '}
                      {course.assignmentCount} tasks
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewCourse(course.id)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        View course
                      </button>

                      {course.isTeacher ? (
                        <button
                          type="button"
                          onClick={() => handleEditCourse(course.id)}
                          className="rounded-full bg-violet-600 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-violet-700"
                        >
                          Edit course
                        </button>
                      ) : course.isEnrolled ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-600">
                          Enrolled
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleEnroll(course.id)}
                          disabled={enrollingId === course.id}
                          className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          {enrollingId === course.id ? 'Enrolling…' : 'Enroll'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {totalPages >= 1 && courses.length > 0 && (
                <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoadingCourses}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Prev
                  </button>
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) =>
                        totalPages ? Math.min(totalPages, p + 1) : p + 1,
                      )
                    }
                    disabled={page === totalPages || isLoadingCourses}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={closeCreateModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-course-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="create-course-title" className="text-lg font-semibold text-slate-900">
              Create course
            </h2>
            <form onSubmit={handleCreateCourse} className="mt-4 space-y-4">
              <div>
                <label htmlFor="create-course-title-input" className="block text-xs font-medium text-slate-600">
                  Title
                </label>
                <input
                  id="create-course-title-input"
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="e.g. Introduction to Python"
                  maxLength={255}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  disabled={createSubmitting}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="create-course-description" className="block text-xs font-medium text-slate-600">
                  Description <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="create-course-description"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Brief description of the course"
                  maxLength={2000}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  disabled={createSubmitting}
                />
              </div>
              {createError && (
                <p className="text-sm text-red-600">{createError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={createSubmitting}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
                >
                  {createSubmitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

