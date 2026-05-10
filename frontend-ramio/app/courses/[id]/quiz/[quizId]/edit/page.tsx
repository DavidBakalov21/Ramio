'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useToast } from '@/app/components/utility/toast';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';
import { QuizImageUpload } from '@/app/components/quizzes/QuizImageUpload';
import {
  Quiz,
  isQuizOpenStyleQuestion,
  type QuizQuestionType,
} from '@/app/interfaces/Quiz';

type AnswerEdit = { id: string; text: string; isCorrect: boolean; imageUrl: string | null };
type QuestionEdit = { id: string; type: string; text: string; points: number; imageUrl: string | null; answers: AnswerEdit[] };

export default function EditQuizPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const courseId = params.id as string;
  const quizId = params.quizId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [deadline, setDeadline] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [questions, setQuestions] = useState<QuestionEdit[]>([]);

  useEffect(() => {
    if (!user || !quizId) return;
    api.get<Quiz>(`/quiz/${quizId}`)
      .then((r) => {
        setDeadline(r.data.deadline ? new Date(r.data.deadline).toISOString().slice(0, 16) : '');
        setTimeLimit(r.data.timeLimit != null ? String(r.data.timeLimit) : '');
        setQuestions(r.data.questions.map((q) => ({
          id: q.id, type: q.type, text: q.text, points: q.points, imageUrl: q.imageUrl ?? null,
          answers: q.answers.map((a) => ({ id: a.id, text: a.text, isCorrect: a.isCorrect ?? false, imageUrl: a.imageUrl ?? null })),
        })));
      })
      .catch(() => router.replace(`/courses/${courseId}/quiz/${quizId}`))
      .finally(() => setLoading(false));
  }, [user, quizId, courseId, router]);

  const updateQuestion = (qi: number, patch: Partial<QuestionEdit>) =>
    setQuestions((p) => p.map((q, i) => (i === qi ? { ...q, ...patch } : q)));

  const updateAnswer = (qi: number, ai: number, patch: Partial<AnswerEdit>) =>
    setQuestions((p) => p.map((q, i) => i !== qi ? q : { ...q, answers: q.answers.map((a, j) => j === ai ? { ...a, ...patch } : a) }));

  const setOneCorrect = (qi: number, ai: number) =>
    setQuestions((p) => p.map((q, i) => i !== qi ? q : { ...q, answers: q.answers.map((a, j) => ({ ...a, isCorrect: j === ai })) }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const deadlineTs = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : null;
      const timeLimitVal = timeLimit ? Number(timeLimit) : null;
      await api.patch(`/quiz/${quizId}`, {
        deadline: deadlineTs,
        timeLimit: timeLimitVal,
        questions: questions.map((q) => ({
          id: Number(q.id),
          points: q.points,
          imageUrl: q.imageUrl,
          answers: q.answers.map((a) => ({ id: Number(a.id), isCorrect: a.isCorrect, imageUrl: a.imageUrl })),
        })),
      });
      showToast('Quiz updated. Existing scores recalculated.', 'success');
      router.push(`/courses/${courseId}/quiz/${quizId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to update quiz.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingUser || loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  if (!user) return null;

  return (
    <TeacherPageShell user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
      <button type="button" onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}`)}
        className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700">
        ← Back to quiz
      </button>
      <h1 className="text-xl font-semibold text-slate-900">Edit quiz</h1>
      <p className="mt-1 text-xs text-slate-500">
        You can change the time limit, deadline, question points, and which answers are correct.
        Changes to points or correct answers will recalculate all existing student scores.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Time limit in minutes (leave blank to remove)</label>
            <input type="number" min={1} step="any" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)}
              placeholder="No limit"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Deadline (leave blank to remove)</label>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-slate-800">Questions</p>
          {questions.map((q, qi) => (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="text-sm text-slate-800">{qi + 1}. {q.text}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <label className="text-xs text-slate-500">Points:</label>
                  <input type="number" min={0} step="any" value={q.points}
                    onChange={(e) => updateQuestion(qi, { points: Number(e.target.value) })}
                    className="w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm focus:border-violet-500 focus:outline-none" />
                </div>
              </div>
              <QuizImageUpload value={q.imageUrl} onChange={(url) => updateQuestion(qi, { imageUrl: url })} />

              {!isQuizOpenStyleQuestion(q.type as QuizQuestionType) ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-slate-500">
                    {q.type === 'ONE_ANSWER' ? 'Mark correct answer:' : 'Mark correct answers:'}
                  </p>
                  {q.answers.map((a, ai) => (
                    <div key={a.id} className={`flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 transition ${a.isCorrect ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                      <div className="flex cursor-pointer items-center gap-2.5">
                        {q.type === 'ONE_ANSWER' ? (
                          <input type="radio" name={`q${qi}`} checked={a.isCorrect} onChange={() => setOneCorrect(qi, ai)}
                            className="h-4 w-4 shrink-0 accent-violet-600" />
                        ) : (
                          <input type="checkbox" checked={a.isCorrect} onChange={(e) => updateAnswer(qi, ai, { isCorrect: e.target.checked })}
                            className="h-4 w-4 shrink-0 accent-violet-600" />
                        )}
                        <span className="text-sm text-slate-800">{a.text}</span>
                      </div>
                      <QuizImageUpload value={a.imageUrl} onChange={(url) => updateAnswer(qi, ai, { imageUrl: url })} />
                    </div>
                  ))}
                </div>
              ) : q.type === 'OPEN_ANSWER' ? (
                <p className="text-xs italic text-slate-500">Open answer — graded manually.</p>
              ) : (
                <p className="text-xs italic text-slate-500">
                  Coding task — tests, language, and AI options are fixed at creation for now; you can still adjust points.
                </p>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}`)}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </TeacherPageShell>
  );
}
