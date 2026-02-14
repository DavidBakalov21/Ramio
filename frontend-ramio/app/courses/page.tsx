'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!user?.role) return;
    const fetchCourses = async () => {
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
    };
    fetchCourses();
  }, [user?.role, page]);

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
    </div>
  );
}

