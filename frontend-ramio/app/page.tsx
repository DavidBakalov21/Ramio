'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from './interfaces/User';
import { Course, CoursePage } from './interfaces/Course';
import { api } from '@/lib/axios';
import { Navbar } from './components/Navbar';
import { useToast } from './components/utility/toast';

export default function Home() {
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesPage, setCoursesPage] = useState(1);
  const [coursesTotalPages, setCoursesTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.get<User>('/me');
        const currentUser = response.data;
        setUser(currentUser);
        if (!currentUser.role || !currentUser.username) {
          router.push('/onboarding');
          return;
        }
      } catch {
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!user?.role) return;
    const fetchCourses = async () => {
      setCoursesLoading(true);
      try {
        const res = await api.get<CoursePage>('/course', {
          params: { page: coursesPage, limit: 6 },
        });
        setCourses(res.data.items);
        setCoursesTotalPages(res.data.totalPages);
      } catch {
        setCourses([]);
        setCoursesTotalPages(1);
      } finally {
        setCoursesLoading(false);
      }
    };
    fetchCourses();
  }, [user?.role, coursesPage]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await api.post('/auth/logout');
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleEnroll = async (courseId: string) => {
    setEnrollingId(courseId);
    try {
      await api.post(`/course/${courseId}/enroll`);
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId ? { ...c, hasPendingRequest: true } : c
        )
      );
      showToast('Enrollment request sent. Teacher will review it.', 'success');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      showToast((msg as string) || 'Failed to send request.', 'error');
    } finally {
      setEnrollingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 py-6">
        <div className="relative flex w-full max-w-5xl flex-col items-center rounded-[1.9rem] bg-white/85 p-6 pb-7 shadow-xl backdrop-blur-sm ring-1 ring-white/60">
          <section className="mb-6 flex max-w-xl flex-col items-center space-y-3 text-center">
          <h1 className="text-2xl font-semibold leading-snug text-slate-900">
            Hi, {user.username || user.email} 👋
          </h1>
          <p className="text-sm text-slate-500">
            You’re signed in as a{' '}
            <span className="font-semibold text-slate-800">
              {user.role?.toLowerCase()}
            </span>
            . We’ll tailor your experience to help you{' '}
            {user.role === 'TEACHER' ? 'teach and manage classes.' : 'learn faster.'}
          </p>
        </section>

        <section className="flex w-full max-w-2xl flex-col items-center space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Courses
          </h2>
          <button
            type="button"
            onClick={() => router.push('/courses')}
            className="text-xs font-medium text-violet-700 underline-offset-2 hover:underline"
          >
            View all courses
          </button>
          {coursesLoading ? (
            <p className="text-sm text-slate-500">Loading courses…</p>
          ) : courses.length === 0 ? (
            <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-500">
              No courses yet. Teachers can create courses from the backend or a future admin UI.
            </div>
          ) : (
            <>
              <ul className="grid w-full gap-3 sm:grid-cols-2">
                {courses.map((course) => (
                  <li
                    key={course.id}
                    className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-violet-200 hover:shadow-md"
                  >
                    <h3 className="font-semibold text-slate-900">{course.title}</h3>
                    {course.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {course.description}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-slate-400">
                      {course.teacherName} · {course.enrollmentCount} enrolled ·{' '}
                      {course.assignmentCount} tasks
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/courses/${course.id}`)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        View course
                      </button>

                      {course.isTeacher ? (
                        <button
                          type="button"
                          onClick={() => router.push(`/courses/${course.id}`)}
                          className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700"
                        >
                          Edit course
                        </button>
                      ) : course.isEnrolled ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                          Enrolled
                        </span>
                      ) : course.hasPendingRequest ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">
                          Request sent
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleEnroll(course.id)}
                          disabled={enrollingId === course.id}
                          className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          {enrollingId === course.id ? 'Sending…' : 'Request to enroll'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {coursesTotalPages >= 1 && courses.length > 0 && (
                <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => setCoursesPage((p) => Math.max(1, p - 1))}
                    disabled={coursesPage === 1 || coursesLoading}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Prev
                  </button>
                  <span>
                    Page {coursesPage} of {coursesTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCoursesPage((p) =>
                        coursesTotalPages ? Math.min(coursesTotalPages, p + 1) : p + 1,
                      )
                    }
                    disabled={coursesPage === coursesTotalPages || coursesLoading}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        </div>
      </main>
    </div>
  );
}
