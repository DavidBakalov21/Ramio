'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { User } from '../../interfaces/User';
import { Course, PendingEnrollmentRequest } from '../../interfaces/Course';
import { AssignmentsSection } from '@/app/components/assignments';
import { PendingEnrollmentRequests } from '@/app/components/PendingEnrollmentRequests';

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [activeTab, setActiveTab] = useState<'assignments' | 'materials' | 'requests'>('assignments');
  const [pendingRequests, setPendingRequests] = useState<PendingEnrollmentRequest[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [actingPendingId, setActingPendingId] = useState<string | null>(null);

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
    if (!courseId || !course?.isTeacher || activeTab !== 'requests') return;
    const fetchPending = async () => {
      setLoadingPending(true);
      try {
        const res = await api.get<PendingEnrollmentRequest[]>(`/course/${courseId}/pending-enrollments`);
        setPendingRequests(res.data);
      } catch {
        setPendingRequests([]);
      } finally {
        setLoadingPending(false);
      }
    };
    fetchPending();
  }, [courseId, course?.isTeacher, activeTab]);

  const handleAcceptRequest = async (pendingId: string) => {
    setActingPendingId(pendingId);
    try {
      await api.post(`/course/${courseId}/pending-enrollments/${pendingId}/accept`);
      setPendingRequests((prev) => prev.filter((r) => r.id !== pendingId));
      setCourse((prev) =>
        prev
          ? {
              ...prev,
              enrollmentCount: prev.enrollmentCount + 1,
              pendingRequestCount: Math.max(0, (prev.pendingRequestCount ?? 0) - 1),
            }
          : null,
      );
    } finally {
      setActingPendingId(null);
    }
  };

  const handleDeclineRequest = async (pendingId: string) => {
    setActingPendingId(pendingId);
    try {
      await api.post(`/course/${courseId}/pending-enrollments/${pendingId}/decline`);
      setPendingRequests((prev) => prev.filter((r) => r.id !== pendingId));
      setCourse((prev) =>
        prev
          ? {
              ...prev,
              pendingRequestCount: Math.max(0, (prev.pendingRequestCount ?? 0) - 1),
            }
          : null,
      );
    } finally {
      setActingPendingId(null);
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
            {course.teacherName} · {course.enrollmentCount} enrolled · {course.assignmentCount}{' '}
            assignments
          </p>

          {/* Tabs */}
          <div className="mt-4 flex gap-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('assignments')}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                activeTab === 'assignments'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Assignments
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('materials')}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                activeTab === 'materials'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Lecture materials
            </button>
            {course.isTeacher && (
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                  activeTab === 'requests'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Requests
                {((activeTab === 'requests' ? pendingRequests.length : course.pendingRequestCount) ?? 0) > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs text-white">
                    {activeTab === 'requests' ? pendingRequests.length : (course.pendingRequestCount ?? 0)}
                  </span>
                )}
              </button>
            )}
          </div>
        </header>

        {activeTab === 'assignments' && (
          <AssignmentsSection courseId={courseId} isTeacher={course.isTeacher} />
        )}

        {activeTab === 'materials' && (
          <section className="mb-8 flex w-full flex-col gap-3">
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
        )}

        {activeTab === 'requests' && course.isTeacher && (
          <PendingEnrollmentRequests
            requests={pendingRequests}
            loading={loadingPending}
            actingId={actingPendingId}
            onAccept={handleAcceptRequest}
            onDecline={handleDeclineRequest}
          />
        )}
      </main>
    </div>
  );
}
