'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { Navbar } from '@/app/components/Navbar';
import { motion } from 'framer-motion';
import { OwnQuizSubmission, Quiz, isQuizOpenStyleQuestion } from '@/app/interfaces/Quiz';

export default function ConfirmQuizSubmitPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const quizId = params.quizId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [submission, setSubmission] = useState<OwnQuizSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !quizId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [quizRes, subRes] = await Promise.all([
          api.get<Quiz>(`/quiz/${quizId}`),
          api.get<OwnQuizSubmission>(`/quiz/${quizId}/submission`),
        ]);
        if (subRes.data.status === 'SUBMITTED') {
          router.replace(`/courses/${courseId}/quiz/${quizId}`);
          return;
        }
        setQuiz(quizRes.data);
        setSubmission(subRes.data);
      } catch {
        router.replace(`/courses/${courseId}/quiz/${quizId}`);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user, quizId, courseId, router]);

  const handleConfirm = async () => {
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/quiz/${quizId}/confirm-submit`);
      router.replace(`/courses/${courseId}/quiz/${quizId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to submit. Please try again.');
      setSubmitting(false);
    }
  };

  if (loadingUser || loading) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
        {user && <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />}
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>
      </div>
    );
  }
  if (!user || !quiz || !submission) return null;

  const totalQuestions = quiz.questions.length;
  const answeredCount = submission.questions.filter((q) => {
    if (isQuizOpenStyleQuestion(q.type))
      return (q.openText ?? '').trim().length > 0;
    return q.answers.some((a) => a.isSelected);
  }).length;
  const unanswered = totalQuestions - answeredCount;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full max-w-md rounded-[1.9rem] bg-white/90 p-8 shadow-xl ring-1 ring-white/60 backdrop-blur-sm"
        >
          <h1 className="text-xl font-semibold text-slate-900">Submit quiz?</h1>
          <p className="mt-1 text-sm text-slate-500">{quiz.title}</p>

          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-600">Questions answered</span>
              <span className="text-sm font-semibold text-slate-900">{answeredCount} / {totalQuestions}</span>
            </div>
            {unanswered > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
                <span className="text-sm text-amber-700">Unanswered questions</span>
                <span className="text-sm font-semibold text-amber-800">{unanswered}</span>
              </div>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Once submitted, you cannot change your answers.
          </p>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}/take`)}
              disabled={submitting}
              className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Back to quiz
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={submitting}
              className="flex-1 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
