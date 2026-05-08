'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useToast } from '@/app/components/utility/toast';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';
import { QuizImageUpload } from '@/app/components/quizzes/QuizImageUpload';
import { QuizQuestionType } from '@/app/interfaces/Quiz';

type AnswerDraft = { text: string; isCorrect: boolean; imageUrl: string | null };
type QuestionDraft = {
  type: QuizQuestionType;
  text: string;
  points: number;
  imageUrl: string | null;
  answers: AnswerDraft[];
};

const QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  ONE_ANSWER: 'Single choice',
  MULTI_ANSWER: 'Multiple choice',
  OPEN_ANSWER: 'Open answer',
};

function blankQuestion(): QuestionDraft {
  return {
    type: 'ONE_ANSWER',
    text: '',
    points: 1,
    imageUrl: null,
    answers: [{ text: '', isCorrect: true, imageUrl: null }, { text: '', isCorrect: false, imageUrl: null }],
  };
}

export default function NewQuizPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const courseId = params.id as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [courseAllowed, setCourseAllowed] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [deadline, setDeadline] = useState('');
  const [allowReview, setAllowReview] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);
  const [showPointsPerQuestion, setShowPointsPerQuestion] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([blankQuestion()]);

  useEffect(() => {
    if (!user?.role || !courseId) return;
    api.get<{ isTeacher: boolean }>(`/course/${courseId}`)
      .then((r) => setCourseAllowed(!!r.data.isTeacher))
      .catch(() => setCourseAllowed(false));
  }, [user?.role, courseId]);

  const updateQuestion = (qi: number, patch: Partial<QuestionDraft>) =>
    setQuestions((prev) => prev.map((q, i) => (i === qi ? { ...q, ...patch } : q)));

  const updateAnswer = (qi: number, ai: number, patch: Partial<AnswerDraft>) =>
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi ? { ...q, answers: q.answers.map((a, j) => (j === ai ? { ...a, ...patch } : a)) } : q,
      ),
    );

  const addAnswer = (qi: number) =>
    setQuestions((prev) =>
      prev.map((q, i) => (i === qi ? { ...q, answers: [...q.answers, { text: '', isCorrect: false, imageUrl: null }] } : q)),
    );

  const removeAnswer = (qi: number, ai: number) =>
    setQuestions((prev) =>
      prev.map((q, i) => (i === qi ? { ...q, answers: q.answers.filter((_, j) => j !== ai) } : q)),
    );

  const setOneCorrect = (qi: number, ai: number) =>
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi ? { ...q, answers: q.answers.map((a, j) => ({ ...a, isCorrect: j === ai })) } : q,
      ),
    );

  const changeQuestionType = (qi: number, type: QuizQuestionType) =>
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qi) return q;
        const newQ: QuestionDraft = { ...q, type };
        if (type === 'OPEN_ANSWER') {
          newQ.answers = [];
        } else if (q.type === 'OPEN_ANSWER') {
          newQ.answers = [{ text: '', isCorrect: true }, { text: '', isCorrect: false }];
        }
        if (type === 'ONE_ANSWER') {
          const first = newQ.answers.findIndex((a) => a.isCorrect);
          newQ.answers = newQ.answers.map((a, j) => ({ ...a, isCorrect: j === (first >= 0 ? first : 0) }));
        }
        return newQ;
      }),
    );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError('Title is required.'); return; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) { setError(`Question ${i + 1} text is required.`); return; }
      if (q.points < 0) { setError(`Question ${i + 1} points cannot be negative.`); return; }
      if (q.type !== 'OPEN_ANSWER') {
        if (q.answers.length < 2) { setError(`Question ${i + 1} needs at least 2 answers.`); return; }
        if (!q.answers.some((a) => a.isCorrect)) { setError(`Question ${i + 1} needs at least one correct answer.`); return; }
        if (q.answers.some((a) => !a.text.trim())) { setError(`All answers in question ${i + 1} need text.`); return; }
      }
    }
    setError('');
    setSubmitting(true);
    try {
      const deadlineTs = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : undefined;
      const timeLimitVal = timeLimit ? Number(timeLimit) : undefined;
      await api.post('/quiz', {
        title: trimmedTitle,
        description: description.trim() || undefined,
        courseId: Number(courseId),
        timeLimit: timeLimitVal,
        deadline: deadlineTs,
        allowReview,
        showCorrectAnswers,
        showPointsPerQuestion,
        questions: questions.map((q, i) => ({
          type: q.type,
          text: q.text.trim(),
          points: q.points,
          order: i,
          imageUrl: q.imageUrl ?? undefined,
          answers: q.type !== 'OPEN_ANSWER'
            ? q.answers.map((a, j) => ({ text: a.text.trim(), isCorrect: a.isCorrect, order: j, imageUrl: a.imageUrl ?? undefined }))
            : undefined,
        })),
      });
      showToast('Quiz created.', 'success');
      router.push(`/courses/${courseId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to create quiz.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingUser || courseAllowed === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  }
  if (!user) return null;
  if (!courseAllowed) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Only the course teacher can create quizzes.</div>;
  }

  return (
    <TeacherPageShell user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
      <button type="button" onClick={() => router.push(`/courses/${courseId}`)}
        className="mb-3 self-start text-xs font-medium text-slate-500 hover:text-slate-700">
        ← Back to course
      </button>
      <h1 className="text-xl font-semibold text-slate-900">Create quiz</h1>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-5">
        <div className="grid gap-3">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Quiz title" maxLength={255}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Quiz description (optional)" rows={2} maxLength={4000}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Time limit (minutes, optional)</label>
              <input type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)}
                placeholder="No limit"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Deadline (optional)</label>
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Review visibility</p>
          <div className="flex flex-col gap-2">
            {([
              ['Allow students to view review page', allowReview, setAllowReview],
              ['Show correct answers in review', showCorrectAnswers, setShowCorrectAnswers],
              ['Show points per question in review', showPointsPerQuestion, setShowPointsPerQuestion],
            ] as [string, boolean, (v: boolean) => void][]).map(([label, value, set]) => (
              <label key={label} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-violet-600" />
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-slate-800">Questions</p>
          {questions.map((q, qi) => (
            <div key={qi} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500">Question {qi + 1}</span>
                {questions.length > 1 && (
                  <button type="button" onClick={() => setQuestions((p) => p.filter((_, i) => i !== qi))}
                    className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>

                <div className="grid gap-3">
                <textarea value={q.text} onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                  placeholder="Question text" rows={2} maxLength={2000}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                <QuizImageUpload value={q.imageUrl} onChange={(url) => updateQuestion(qi, { imageUrl: url })} />

                <div className="flex flex-wrap items-center gap-3">
                  <select value={q.type} onChange={(e) => changeQuestionType(qi, e.target.value as QuizQuestionType)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none">
                    {(Object.keys(QUESTION_TYPE_LABELS) as QuizQuestionType[]).map((t) => (
                      <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-slate-600">Points:</label>
                    <input type="number" min={0} step="any" value={q.points}
                      onChange={(e) => updateQuestion(qi, { points: Number(e.target.value) })}
                      className="w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm focus:border-violet-500 focus:outline-none" />
                  </div>
                </div>

                {q.type !== 'OPEN_ANSWER' && (
                  <div className="flex flex-col gap-2 mt-1">
                    <p className="text-xs text-slate-500">
                      {q.type === 'ONE_ANSWER' ? 'Select one correct answer:' : 'Select all correct answers:'}
                    </p>
                    {q.answers.map((a, ai) => (
                      <div key={ai} className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-2">
                        <div className="flex items-center gap-2">
                          {q.type === 'ONE_ANSWER' ? (
                            <input type="radio" name={`q${qi}`} checked={a.isCorrect}
                              onChange={() => setOneCorrect(qi, ai)}
                              className="h-4 w-4 shrink-0 accent-violet-600" />
                          ) : (
                            <input type="checkbox" checked={a.isCorrect}
                              onChange={(e) => updateAnswer(qi, ai, { isCorrect: e.target.checked })}
                              className="h-4 w-4 shrink-0 accent-violet-600" />
                          )}
                          <input type="text" value={a.text}
                            onChange={(e) => updateAnswer(qi, ai, { text: e.target.value })}
                            placeholder={`Answer ${ai + 1}`} maxLength={1000}
                            className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none" />
                          {q.answers.length > 2 && (
                            <button type="button" onClick={() => removeAnswer(qi, ai)}
                              className="shrink-0 text-xs text-slate-400 hover:text-red-500">✕</button>
                          )}
                        </div>
                        <QuizImageUpload value={a.imageUrl} onChange={(url) => updateAnswer(qi, ai, { imageUrl: url })} />
                      </div>
                    ))}
                    <button type="button" onClick={() => addAnswer(qi)}
                      className="self-start text-xs font-medium text-violet-600 hover:text-violet-800">
                      + Add answer
                    </button>
                  </div>
                )}

                {q.type === 'OPEN_ANSWER' && (
                  <p className="text-xs italic text-slate-500">Students write a text answer. You grade it manually.</p>
                )}
              </div>
            </div>
          ))}

          <button type="button" onClick={() => setQuestions((p) => [...p, blankQuestion()])}
            className="self-start rounded-full border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50">
            + Add question
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push(`/courses/${courseId}`)}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {submitting ? 'Creating…' : 'Create quiz'}
          </button>
        </div>
      </form>
    </TeacherPageShell>
  );
}
