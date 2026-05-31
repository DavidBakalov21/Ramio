'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { QuizListItem } from '@/app/interfaces/Quiz';

interface QuizzesSectionProps {
  courseId: string;
  isTeacher: boolean;
}

function deadlineLabel(
  deadline: string | null,
): { text: string; urgent: boolean } | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return { text: 'Closed', urgent: true };
  const diffH = diffMs / 3_600_000;
  if (diffH < 24)
    return { text: `Closes in ${Math.ceil(diffH)}h`, urgent: true };
  return { text: `Due ${d.toLocaleDateString()}`, urgent: false };
}

export function QuizzesSection({ courseId, isTeacher }: QuizzesSectionProps) {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<QuizListItem[]>(`/quiz/course/${courseId}`);
      setQuizzes(res.data);
    } catch {
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  return (
    <section className="mb-8 flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Quizzes</h2>
        {isTeacher && (
          <button
            type="button"
            onClick={() => router.push(`/courses/${courseId}/quiz/new`)}
            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
          >
            Add
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading quizzes…</p>
      ) : quizzes.length === 0 ? (
        <p className="text-sm text-slate-500">
          {isTeacher
            ? 'No quizzes yet. Use "Add" to create one.'
            : 'No quizzes yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {quizzes.map((quiz) => {
            const dl = deadlineLabel(quiz.deadline);
            const sub = quiz.submission;
            const isClosed =
              quiz.deadline && new Date(quiz.deadline) < new Date();

            let statusBadge: { label: string; color: string } | null = null;
            if (!isTeacher) {
              if (!sub) {
                statusBadge = isClosed
                  ? { label: 'Closed', color: 'bg-slate-100 text-slate-500' }
                  : {
                      label: 'Not started',
                      color: 'bg-slate-100 text-slate-600',
                    };
              } else if (sub.status === 'IN_PROGRESS') {
                statusBadge = {
                  label: 'In progress',
                  color: 'bg-amber-100 text-amber-700',
                };
              } else {
                statusBadge = {
                  label: 'Submitted',
                  color: 'bg-emerald-100 text-emerald-700',
                };
              }
            }

            return (
              <button
                key={quiz.id}
                type="button"
                onClick={() =>
                  router.push(`/courses/${courseId}/quiz/${quiz.id}`)
                }
                className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50/60"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium text-slate-900 truncate">
                    {quiz.title}
                  </span>
                  <span className="text-xs text-slate-500">
                    {quiz.questionCount} question
                    {quiz.questionCount !== 1 ? 's' : ''} · {quiz.totalPoints}{' '}
                    pts
                    {quiz.timeLimit ? ` · ${quiz.timeLimit} min` : ''}
                  </span>
                  {dl && (
                    <span
                      className={`text-xs font-medium ${dl.urgent ? 'text-red-600' : 'text-slate-500'}`}
                    >
                      {dl.text}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {statusBadge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.color}`}
                    >
                      {statusBadge.label}
                    </span>
                  )}
                  {!isTeacher &&
                    sub?.status === 'SUBMITTED' &&
                    sub.totalPoints != null && (
                      <span className="text-xs text-slate-500">
                        {Math.round(sub.totalPoints * 100) / 100} /{' '}
                        {quiz.totalPoints} pts
                      </span>
                    )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
