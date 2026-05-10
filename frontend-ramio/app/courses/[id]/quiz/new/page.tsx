'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useToast } from '@/app/components/utility/toast';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';
import { QuizImageUpload } from '@/app/components/quizzes/QuizImageUpload';
import {
  QuizCodingGradingMode,
  QuizQuestionType,
  isQuizOpenStyleQuestion,
} from '@/app/interfaces/Quiz';
import type { AssignmentLanguage } from '@/app/interfaces/Assignment';
import { ASSIGNMENT_LANGUAGE_MAP } from '@/app/constants/assignmentLanguages';

type AnswerDraft = { text: string; isCorrect: boolean; imageUrl: string | null };
type QuestionDraft = {
  type: QuizQuestionType;
  text: string;
  points: number;
  imageUrl: string | null;
  answers: AnswerDraft[];
  codingTaskLanguage?: AssignmentLanguage;
  codingTaskStarterCode?: string;
  codingTaskTeacherTests?: string;
  codingTaskGradingMode?: QuizCodingGradingMode;
  codingTaskAiReviewEnabled?: boolean;
  codingTaskAiReviewRubric?: string;
};

const DEFAULT_PYTHON_TESTS = `import unittest
import solution

class TestQuiz(unittest.TestCase):
    def test_stub(self):
        self.assertTrue(True)`;

const CODING_GRADING_LABELS: Record<QuizCodingGradingMode, string> = {
  MANUAL_ONLY: 'Manual grading',
  TESTS_ONLY: 'Auto-grade from tests only (all pass → full points)',
};
type GeneratedQuizDraft = {
  title: string;
  description: string;
  questions: {
    type: QuizQuestionType;
    text: string;
    points: number;
    answers: { text: string; isCorrect: boolean }[];
    codingTaskLanguage?: AssignmentLanguage;
    codingTaskStarterCode?: string;
    codingTaskTeacherTests?: string;
    codingTaskGradingMode?: QuizCodingGradingMode;
    codingTaskAiReviewEnabled?: boolean;
    codingTaskAiReviewRubric?: string;
  }[];
};

const QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  ONE_ANSWER: 'Single choice',
  MULTI_ANSWER: 'Multiple choice',
  OPEN_ANSWER: 'Open answer',
  CODING_TASK: 'Coding task',
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
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiQuestionCount, setAiQuestionCount] = useState('5');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

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
        if (type === 'CODING_TASK') {
          newQ.answers = [];
          newQ.codingTaskLanguage = newQ.codingTaskLanguage ?? 'PYTHON';
          newQ.codingTaskStarterCode =
            newQ.codingTaskStarterCode ?? '# solution.py — define symbols your tests import.\n';
          newQ.codingTaskTeacherTests =
            newQ.codingTaskTeacherTests ?? DEFAULT_PYTHON_TESTS;
          newQ.codingTaskGradingMode =
            newQ.codingTaskGradingMode ?? 'MANUAL_ONLY';
          newQ.codingTaskAiReviewEnabled = newQ.codingTaskAiReviewEnabled ?? false;
          newQ.codingTaskAiReviewRubric = newQ.codingTaskAiReviewRubric ?? '';
        } else if (type === 'OPEN_ANSWER') {
          newQ.answers = [];
          delete newQ.codingTaskLanguage;
          delete newQ.codingTaskStarterCode;
          delete newQ.codingTaskTeacherTests;
          delete newQ.codingTaskGradingMode;
          delete newQ.codingTaskAiReviewEnabled;
          delete newQ.codingTaskAiReviewRubric;
        } else if (isQuizOpenStyleQuestion(q.type)) {
          delete newQ.codingTaskLanguage;
          delete newQ.codingTaskStarterCode;
          delete newQ.codingTaskTeacherTests;
          delete newQ.codingTaskGradingMode;
          delete newQ.codingTaskAiReviewEnabled;
          delete newQ.codingTaskAiReviewRubric;
          newQ.answers = [
            { text: '', isCorrect: true, imageUrl: null },
            { text: '', isCorrect: false, imageUrl: null },
          ];
        }
        if (type === 'ONE_ANSWER') {
          const first = newQ.answers.findIndex((a) => a.isCorrect);
          newQ.answers = newQ.answers.map((a, j) => ({ ...a, isCorrect: j === (first >= 0 ? first : 0) }));
        }
        return newQ;
      }),
    );

  const applyGeneratedDraft = (draft: GeneratedQuizDraft) => {
    const generatedQuestions: QuestionDraft[] = draft.questions.map((q) => {
      const answers: AnswerDraft[] = isQuizOpenStyleQuestion(q.type)
        ? []
        : q.answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect, imageUrl: null }));
      return {
        type: q.type,
        text: q.text,
        points: q.points,
        imageUrl: null,
        answers,
        ...(q.type === 'CODING_TASK'
          ? {
              codingTaskLanguage: q.codingTaskLanguage ?? 'PYTHON',
              codingTaskStarterCode:
                (q.codingTaskStarterCode?.trim() ||
                  '# solution.py — define symbols your tests import.\n'),
              codingTaskTeacherTests:
                (q.codingTaskTeacherTests?.trim() || DEFAULT_PYTHON_TESTS),
              codingTaskGradingMode:
                q.codingTaskGradingMode ?? 'MANUAL_ONLY',
              codingTaskAiReviewEnabled:
                !!q.codingTaskAiReviewEnabled,
              codingTaskAiReviewRubric:
                q.codingTaskAiReviewRubric?.trim() ?? '',
            }
          : {}),
      };
    });
    if (!generatedQuestions.length) {
      setError('AI returned no valid questions.');
      return;
    }
    setTitle(draft.title || '');
    setDescription(draft.description || '');
    setQuestions(generatedQuestions);
  };

  const handleGenerateWithAi = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setError('Please enter instructions for AI quiz generation.');
      return;
    }
    setError('');
    setIsGeneratingAi(true);
    try {
      const count = Number(aiQuestionCount);
      const { data } = await api.post<GeneratedQuizDraft>('/quiz/generate', {
        courseId: Number(courseId),
        prompt,
        questionCount: Number.isFinite(count) && count > 0 ? count : undefined,
      });
      applyGeneratedDraft(data);
      showToast('Quiz draft generated with AI.', 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const resolved = Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to generate AI quiz draft.';
      if (typeof resolved === 'string' && resolved.toLowerCase().includes('ai returned invalid quiz schema')) {
        const zodMessage = 'ai failed try again or change prompt';
        setError(zodMessage);
        showToast(zodMessage, 'error');
      } else {
        setError(resolved);
      }
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError('Title is required.'); return; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) { setError(`Question ${i + 1} text is required.`); return; }
      if (q.points < 0) { setError(`Question ${i + 1} points cannot be negative.`); return; }
      if (q.type === 'CODING_TASK') {
        if (!q.codingTaskLanguage) {
          setError(`Question ${i + 1}: choose a programming language.`);
          return;
        }
        if (!q.codingTaskTeacherTests?.trim()) {
          setError(`Question ${i + 1}: unit tests cannot be empty.`);
          return;
        }
      } else if (!isQuizOpenStyleQuestion(q.type)) {
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
          answers:
            !isQuizOpenStyleQuestion(q.type)
              ? q.answers.map((a, j) => ({
                  text: a.text.trim(),
                  isCorrect: a.isCorrect,
                  order: j,
                  imageUrl: a.imageUrl ?? undefined,
                }))
              : undefined,
          ...(q.type === 'CODING_TASK'
            ? {
                codingTaskLanguage: q.codingTaskLanguage,
                codingTaskStarterCode: q.codingTaskStarterCode?.trim() || undefined,
                codingTaskTeacherTests: q.codingTaskTeacherTests!.trim(),
                codingTaskGradingMode: q.codingTaskGradingMode,
                codingTaskAiReviewEnabled: !!q.codingTaskAiReviewEnabled,
                codingTaskAiReviewRubric: q.codingTaskAiReviewRubric?.trim() || undefined,
              }
            : {}),
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

        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
          <p className="text-sm font-semibold text-violet-900">Generate with AI</p>
          <p className="mt-1 text-xs text-violet-800/90">
            Write freely—topic, difficulty, languages, roughly how many of each question style, coding vs multiple choice vs short answer. You don&apos;t need any special format; the assistant figures out structure. Generated content replaces your current draft.
          </p>
          <div className="mt-3 grid gap-3">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={3}
              maxLength={3000}
              placeholder="Example: Week 4 review for my intro Python class — mix recap MCQ, two short explanations, one small coding function with tests roughly like the Factorial exercise."
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-violet-900">Questions:</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={aiQuestionCount}
                  onChange={(e) => setAiQuestionCount(e.target.value)}
                  className="w-20 rounded-xl border border-violet-200 bg-white px-2 py-1.5 text-sm focus:border-violet-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={isGeneratingAi}
                onClick={handleGenerateWithAi}
                className="rounded-full bg-violet-700 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                {isGeneratingAi ? 'Generating…' : 'Generate draft'}
              </button>
            </div>
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

                {!isQuizOpenStyleQuestion(q.type) && (
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

                {q.type === 'CODING_TASK' && (
                  <div className="mt-1 grid gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-xs text-slate-600">
                      Same Docker runners as course assignments (<code className="text-[11px]">solution.py</code> /
                      {' '}<code className="text-[11px]">test_solution.py</code> for Python, etc.).
                    </p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Language</label>
                      <select
                        value={q.codingTaskLanguage ?? 'PYTHON'}
                        onChange={(e) =>
                          updateQuestion(qi, {
                            codingTaskLanguage: e.target.value as AssignmentLanguage,
                          })}
                        className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none">
                        {(Object.keys(ASSIGNMENT_LANGUAGE_MAP) as AssignmentLanguage[]).map((lang) => (
                          <option key={lang} value={lang}>{ASSIGNMENT_LANGUAGE_MAP[lang].label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Starter code (shown to students)</label>
                      <textarea
                        value={q.codingTaskStarterCode ?? ''}
                        onChange={(e) =>
                          updateQuestion(qi, { codingTaskStarterCode: e.target.value })}
                        rows={5}
                        maxLength={100_000}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Teacher unit tests</label>
                      <textarea
                        value={q.codingTaskTeacherTests ?? ''}
                        onChange={(e) =>
                          updateQuestion(qi, { codingTaskTeacherTests: e.target.value })}
                        rows={10}
                        maxLength={100_000}
                        placeholder={ASSIGNMENT_LANGUAGE_MAP[q.codingTaskLanguage ?? 'PYTHON'].testCodePlaceholder}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Grading</label>
                      <select
                        value={q.codingTaskGradingMode ?? 'MANUAL_ONLY'}
                        onChange={(e) =>
                          updateQuestion(qi, {
                            codingTaskGradingMode: e.target.value as QuizCodingGradingMode,
                          })}
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none">
                        {(Object.keys(CODING_GRADING_LABELS) as QuizCodingGradingMode[]).map((m) => (
                          <option key={m} value={m}>{CODING_GRADING_LABELS[m]}</option>
                        ))}
                      </select>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!q.codingTaskAiReviewEnabled}
                        onChange={(e) =>
                          updateQuestion(qi, {
                            codingTaskAiReviewEnabled: e.target.checked,
                          })}
                        className="h-4 w-4 accent-violet-600"
                      />
                      <span className="text-sm text-slate-700">AI code review after submit</span>
                    </label>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        AI review hints (optional)
                      </label>
                      <p className="mb-1.5 text-xs text-slate-500">
                        Saved with this question either way; Bedrock reads them only when AI review above is on.
                      </p>
                      <textarea
                        value={q.codingTaskAiReviewRubric ?? ''}
                        onChange={(e) =>
                          updateQuestion(qi, { codingTaskAiReviewRubric: e.target.value })}
                        rows={2}
                        maxLength={4000}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                  </div>
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
