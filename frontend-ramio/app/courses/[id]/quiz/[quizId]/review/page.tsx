'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { Navbar } from '@/app/components/Navbar';
import { motion } from 'framer-motion';
import { OwnQuizSubmission } from '@/app/interfaces/Quiz';
import { QuizImage } from '@/app/components/quizzes/QuizImage';

export default function QuizReviewPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const quizId = params.quizId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [submission, setSubmission] = useState<OwnQuizSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);

  useEffect(() => {
    if (!user || !quizId) return;
    api.get<OwnQuizSubmission>(`/quiz/${quizId}/submission`)
      .then((r) => { if (!r.data.allowReview) setNotAvailable(true); else setSubmission(r.data); })
      .catch(() => setNotAvailable(true))
      .finally(() => setLoading(false));
  }, [user, quizId]);

  if (loadingUser || loading) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
        {user && <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />}
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="flex flex-1 justify-center px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="w-full max-w-3xl">
          <button type="button" onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}`)}
            className="mb-4 text-xs font-medium text-slate-500 hover:text-slate-700">
            ← Back to quiz
          </button>

          {notAvailable ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-800">Review not available</p>
              <p className="mt-1 text-sm text-slate-500">The teacher has disabled review for this quiz.</p>
            </div>
          ) : !submission ? (
            <p className="text-sm text-slate-500">No submission found.</p>
          ) : (
            <>
              <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h1 className="text-xl font-semibold text-slate-900">Quiz review</h1>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                  <span>Submitted: {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '—'}</span>
                  {submission.totalPoints != null && (
                    <span className="font-medium text-slate-900">
                      Score: {Math.round(submission.totalPoints * 100) / 100} pts
                      <span className="ml-1 text-xs font-normal text-slate-500">(open answers excluded until graded)</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {submission.questions.map((q, idx) => {
                  const correctIds = new Set(q.answers.filter((a) => a.isCorrect).map((a) => a.id));
                  const selectedIds = new Set(q.answers.filter((a) => a.isSelected).map((a) => a.id));
                  const showPoints = submission.showPointsPerQuestion;
                  const showCorrect = submission.showCorrectAnswers;

                  let verdict: 'correct' | 'partial' | 'wrong' | 'open' | null = null;
                  if (q.type === 'OPEN_ANSWER') verdict = 'open';
                  else if (showPoints && q.pointsEarned != null) {
                    if (q.pointsEarned >= q.points) verdict = 'correct';
                    else if (q.pointsEarned > 0) verdict = 'partial';
                    else verdict = 'wrong';
                  }

                  return (
                    <div key={q.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${
                      verdict === 'correct' ? 'border-emerald-200' :
                      verdict === 'partial' ? 'border-amber-200' :
                      verdict === 'wrong' ? 'border-red-200' : 'border-slate-200'
                    }`}>
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">{idx + 1}. {q.text}</p>
                        {q.imageUrl && <QuizImage url={q.imageUrl} alt={`Question ${idx + 1} image`} />}
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          {showPoints && q.type !== 'OPEN_ANSWER' && q.pointsEarned != null && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              q.pointsEarned >= q.points ? 'bg-emerald-100 text-emerald-700' :
                              q.pointsEarned > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {Math.round(q.pointsEarned * 100) / 100} / {q.points} pts
                            </span>
                          )}
                          {showPoints && q.type === 'OPEN_ANSWER' && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${q.pointsEarned != null ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {q.pointsEarned != null ? `${Math.round(q.pointsEarned * 100) / 100} / ${q.points} pts` : `Pending / ${q.points} pts`}
                            </span>
                          )}
                          {!showPoints && <span className="text-xs text-slate-400">{q.points} pts</span>}
                        </div>
                      </div>

                      {(q.type === 'ONE_ANSWER' || q.type === 'MULTI_ANSWER') && (
                        <div className="flex flex-col gap-2">
                          {q.answers.map((ans) => {
                            const isSelected = selectedIds.has(ans.id);
                            const isCorrect = ans.isCorrect ?? false;
                            let bg = 'border-slate-200 bg-slate-50/40';
                            if (showCorrect) {
                              if (isCorrect && isSelected) bg = 'border-emerald-400 bg-emerald-50';
                              else if (isCorrect) bg = 'border-emerald-300 bg-emerald-50/60';
                              else if (isSelected) bg = 'border-red-300 bg-red-50';
                            } else if (isSelected) {
                              bg = 'border-violet-400 bg-violet-50/40';
                            }
                            return (
                              <div key={ans.id} className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 ${bg}`}>
                                <div className="flex items-center gap-2.5">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                    {isSelected ? (q.type === 'ONE_ANSWER' ? '●' : '☑') : (q.type === 'ONE_ANSWER' ? '○' : '☐')}
                                  </span>
                                  <span className="flex-1 text-sm text-slate-800">{ans.text}</span>
                                  {showCorrect && isCorrect && (
                                    <span className="shrink-0 text-xs font-medium text-emerald-600">✓ correct</span>
                                  )}
                                </div>
                                {ans.imageUrl && <QuizImage url={ans.imageUrl} alt="Answer image" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.type === 'OPEN_ANSWER' && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <p className="mb-1 text-xs font-medium text-slate-500">Your answer:</p>
                          <p className="whitespace-pre-wrap text-sm text-slate-800">
                            {q.openText || <span className="italic text-slate-400">(no answer written)</span>}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
