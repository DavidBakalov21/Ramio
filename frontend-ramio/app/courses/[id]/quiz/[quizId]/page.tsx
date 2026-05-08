'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { Navbar } from '@/app/components/Navbar';
import { motion } from 'framer-motion';
import { Quiz, QuizSubmissionSummary } from '@/app/interfaces/Quiz';

export default function QuizOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const quizId = params.quizId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<QuizSubmissionSummary[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !quizId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [quizRes, courseRes] = await Promise.all([
          api.get<Quiz>(`/quiz/${quizId}`),
          api.get<{ isTeacher: boolean }>(`/course/${courseId}`),
        ]);
        setQuiz(quizRes.data);
        setIsTeacher(!!courseRes.data.isTeacher);
      } catch {
        setQuiz(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user, quizId, courseId]);

  const loadSubmissions = useCallback(() => {
    if (!isTeacher || !quizId) return;
    setLoadingSubmissions(true);
    api.get<QuizSubmissionSummary[]>(`/quiz/${quizId}/submissions`)
      .then((r) => setSubmissions(r.data))
      .catch(() => setSubmissions([]))
      .finally(() => setLoadingSubmissions(false));
  }, [isTeacher, quizId]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!confirm('Reset this student\'s submission? They will be able to retake the quiz.')) return;
    setDeletingId(submissionId);
    try {
      await api.delete(`/quiz/submission/${submissionId}`);
      loadSubmissions();
    } catch {
      alert('Failed to delete submission.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loadingUser) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  if (!user) return null;

  const totalPoints = quiz?.questions.reduce((s, q) => s + q.points, 0) ?? 0;
  const deadlinePassed = quiz?.deadline ? new Date(quiz.deadline) < new Date() : false;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="flex flex-1 items-center justify-center px-4 py-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full max-w-3xl rounded-[1.9rem] bg-white/85 p-6 pb-7 shadow-xl backdrop-blur-sm ring-1 ring-white/60"
        >
          <button type="button" onClick={() => router.push(`/courses/${courseId}`)}
            className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700">
            ← Back to course
          </button>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !quiz ? (
            <p className="text-sm text-slate-600">Quiz not found.</p>
          ) : (
            <>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">{quiz.title}</h1>
                  {quiz.description && <p className="mt-1 text-sm text-slate-500">{quiz.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{quiz.questions.length} questions · {totalPoints} pts</span>
                    {quiz.timeLimit && <span>⏱ {quiz.timeLimit} min</span>}
                    {quiz.deadline && (
                      <span className={deadlinePassed ? 'font-medium text-red-600' : ''}>
                        {deadlinePassed ? '✕ Closed' : `Due ${new Date(quiz.deadline).toLocaleString()}`}
                      </span>
                    )}
                  </div>
                </div>
                {isTeacher && (
                  <button type="button"
                    onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}/edit`)}
                    className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    Edit
                  </button>
                )}
              </div>

              {isTeacher && (
                <div>
                  <h2 className="mb-3 text-sm font-semibold text-slate-800">
                    Submissions {submissions.length > 0 && `(${submissions.length})`}
                  </h2>
                  {loadingSubmissions ? (
                    <p className="text-sm text-slate-500">Loading submissions…</p>
                  ) : submissions.length === 0 ? (
                    <p className="text-sm text-slate-500">No submissions yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
                            <th className="px-4 py-3 font-semibold text-slate-800">Student</th>
                            <th className="px-4 py-3 font-medium text-slate-700">Submitted</th>
                            <th className="px-4 py-3 font-medium text-slate-700">Score</th>
                            <th className="px-4 py-3 font-medium text-slate-700">Status</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {submissions.map((sub) => (
                            <tr key={sub.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-900">{sub.username || sub.email}</p>
                                {sub.username && <p className="text-xs text-slate-500">{sub.email}</p>}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '—'}
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {sub.totalPoints != null ? `${Math.round(sub.totalPoints * 100) / 100}` : '—'}
                                <span className="text-slate-400"> / {sub.totalMax}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sub.isFullyGraded ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {sub.isFullyGraded ? 'Graded' : 'Pending review'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  <button type="button"
                                    onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}/submission/${sub.id}/assess`)}
                                    className="text-xs font-medium text-violet-600 hover:text-violet-800">
                                    Assess
                                  </button>
                                  <button type="button"
                                    onClick={() => void handleDeleteSubmission(sub.id)}
                                    disabled={deletingId === sub.id}
                                    className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50">
                                    {deletingId === sub.id ? 'Deleting…' : 'Reset'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {!isTeacher && (
                <StudentQuizActions
                  courseId={courseId}
                  quizId={quizId}
                  quiz={quiz}
                  deadlinePassed={deadlinePassed}
                  totalPoints={totalPoints}
                />
              )}
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}

function StudentQuizActions({
  courseId, quizId, quiz, deadlinePassed, totalPoints,
}: {
  courseId: string;
  quizId: string;
  quiz: Quiz;
  deadlinePassed: boolean;
  totalPoints: number;
}) {
  const router = useRouter();
  const [subStatus, setSubStatus] = useState<'loading' | 'none' | 'in_progress' | 'submitted'>('loading');
  const [subPoints, setSubPoints] = useState<number | null>(null);

  useEffect(() => {
    api.get<{ status: string; totalPoints: number | null }>(`/quiz/${quizId}/submission`)
      .then((r) => {
        if (r.data.status !== 'SUBMITTED') {
          router.replace(`/courses/${courseId}/quiz/${quizId}/take`);
          return;
        }
        setSubStatus('submitted');
        setSubPoints(r.data.totalPoints);
      })
      .catch(() => setSubStatus('none'));
  }, [quizId, courseId, router]);

  if (subStatus === 'loading') return <p className="text-sm text-slate-500">Loading…</p>;

  if (subStatus === 'submitted') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <p className="text-sm font-semibold text-emerald-800">Quiz submitted</p>
        {subPoints != null && (
          <p className="mt-1 text-sm text-slate-600">
            Score: <span className="font-semibold">{Math.round(subPoints * 100) / 100}</span> / {totalPoints} pts
            <span className="ml-1 text-xs text-slate-500">(open answers excluded until graded)</span>
          </p>
        )}
        <div className="mt-3">
          {quiz.allowReview ? (
            <button type="button"
              onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}/review`)}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              View review
            </button>
          ) : (
            <button type="button" disabled
              className="cursor-not-allowed rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-400"
              title="The teacher has disabled review for this quiz">
              Review not available
            </button>
          )}
        </div>
      </div>
    );
  }

  if (deadlinePassed) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-600">This quiz is closed — the deadline has passed.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-sm text-slate-700">
        {quiz.questions.length} questions · {totalPoints} pts
        {quiz.timeLimit && ` · ${quiz.timeLimit} minute time limit`}
      </p>
      <p className="mt-1 text-xs text-slate-500">Once started, the timer cannot be paused.</p>
      <button type="button"
        onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}/take`)}
        className="mt-3 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800">
        Start quiz
      </button>
    </div>
  );
}
