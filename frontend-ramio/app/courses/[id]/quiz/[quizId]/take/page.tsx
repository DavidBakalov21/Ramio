'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { Navbar } from '@/app/components/Navbar';
import { motion } from 'framer-motion';
import { Quiz } from '@/app/interfaces/Quiz';
import { QuizImage } from '@/app/components/quizzes/QuizImage';

type AnswerState = { selectedIds: string[]; openText: string };

function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TakeQuizPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const quizId = params.quizId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTimerSubmittedRef = useRef(false);

  const buildPayload = useCallback(
    (cur: Record<string, AnswerState>) =>
      (quiz?.questions ?? []).map((q) => {
        const a = cur[q.id] ?? { selectedIds: [], openText: '' };
        return {
          questionId: Number(q.id),
          selectedAnswerIds: q.type !== 'OPEN_ANSWER' ? a.selectedIds.map(Number) : undefined,
          openText: q.type === 'OPEN_ANSWER' ? a.openText || undefined : undefined,
        };
      }),
    [quiz],
  );

  const doSave = useCallback(
    async (cur: Record<string, AnswerState>) => {
      if (!quiz || hasTimerSubmittedRef.current) return;
      await api.patch(`/quiz/${quizId}/submission`, { answers: buildPayload(cur) });
    },
    [quiz, quizId, buildPayload],
  );

  // Used only by the timer — saves + submits in one shot without going to confirm page
  const doTimerSubmit = useCallback(
    async (cur: Record<string, AnswerState>) => {
      if (hasTimerSubmittedRef.current || !quiz) return;
      hasTimerSubmittedRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
      try {
        await api.post(`/quiz/${quizId}/submit`, { answers: buildPayload(cur) });
        router.push(`/courses/${courseId}/quiz/${quizId}`);
      } catch {
        router.push(`/courses/${courseId}/quiz/${quizId}`);
      }
    },
    [quiz, quizId, courseId, router, buildPayload],
  );

  // Manual submit: save all answers first, then go to confirm page
  const handleManualSubmit = async () => {
    if (!quiz || saving) return;
    setSaving(true);
    setError('');
    try {
      await doSave(answers);
      router.push(`/courses/${courseId}/quiz/${quizId}/confirm`);
    } catch {
      setError('Failed to save answers. Please try again.');
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!user || !quizId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [quizRes, startRes] = await Promise.all([
          api.get<Quiz>(`/quiz/${quizId}`),
          api.post<{ startedAt: string; timeLimit: number | null; status: string }>(`/quiz/${quizId}/start`),
        ]);
        if (startRes.data.status === 'SUBMITTED') {
          router.replace(`/courses/${courseId}/quiz/${quizId}`);
          return;
        }
        setQuiz(quizRes.data);
        if (startRes.data.timeLimit) {
          const elapsed = Math.floor((Date.now() - new Date(startRes.data.startedAt).getTime()) / 1000);
          setRemainingSeconds(Math.max(0, startRes.data.timeLimit * 60 - elapsed));
        }
        try {
          const subRes = await api.get<{ questions: { id: string; openText: string | null; answers: { id: string; isSelected: boolean }[] }[] }>(`/quiz/${quizId}/submission`);
          const pre: Record<string, AnswerState> = {};
          for (const q of subRes.data.questions) {
            pre[q.id] = { selectedIds: q.answers.filter((a) => a.isSelected).map((a) => a.id), openText: q.openText ?? '' };
          }
          setAnswers(pre);
        } catch { /* no prior answers */ }
      } catch {
        router.replace(`/courses/${courseId}/quiz/${quizId}`);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user, quizId, courseId, router]);

  // Countdown
  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0) return;
    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds !== null]);

  // Timer expiry → direct submit (no confirm page needed)
  useEffect(() => {
    if (remainingSeconds === 0 && !hasTimerSubmittedRef.current) void doTimerSubmit(answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds]);

  // Auto-save every 30s
  useEffect(() => {
    if (!quiz) return;
    autoSaveTimerRef.current = setInterval(() => {
      if (!hasTimerSubmittedRef.current) void doSave(answers).catch(() => { /* silent */ });
    }, 30_000);
    return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, answers]);

  const setSelected = (qId: string, aId: string) =>
    setAnswers((p) => ({ ...p, [qId]: { ...p[qId] ?? { openText: '' }, selectedIds: [aId] } }));

  const toggleSelected = (qId: string, aId: string) =>
    setAnswers((p) => {
      const cur = p[qId]?.selectedIds ?? [];
      return { ...p, [qId]: { ...p[qId] ?? { openText: '' }, selectedIds: cur.includes(aId) ? cur.filter((x) => x !== aId) : [...cur, aId] } };
    });

  const setOpenText = (qId: string, text: string) =>
    setAnswers((p) => ({ ...p, [qId]: { ...p[qId] ?? { selectedIds: [] }, openText: text } }));

  if (loadingUser || loading) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
        {user && <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />}
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading quiz…</div>
      </div>
    );
  }
  if (!user || !quiz) return null;

  const totalPoints = quiz.questions.reduce((s, q) => s + q.points, 0);
  const timerUrgent = remainingSeconds !== null && remainingSeconds < 120;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />

      <div className="border-b border-slate-200 bg-white/90 px-4 py-2 shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <p className="truncate text-sm font-semibold text-slate-900">{quiz.title}</p>
            <p className="text-xs text-slate-500">{quiz.questions.length} questions · {totalPoints} pts</p>
          </div>
          {remainingSeconds !== null && (
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${timerUrgent ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
              ⏱ {formatTime(remainingSeconds)}
            </div>
          )}
        </div>
      </div>

      <main className="flex flex-1 justify-center px-4 py-6">
        <div className="w-full max-w-3xl space-y-5">
          {quiz.questions.map((q, idx) => {
            const a = answers[q.id] ?? { selectedIds: [], openText: '' };
            return (
              <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{idx + 1}. {q.text}</p>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                </div>
                {q.imageUrl && <QuizImage url={q.imageUrl} alt={`Question ${idx + 1} image`} />}

                {q.type === 'ONE_ANSWER' && (
                  <div className="mt-3 flex flex-col gap-2">
                    {q.answers.map((ans) => (
                      <label key={ans.id} className="flex cursor-pointer flex-col gap-1 rounded-xl border border-slate-200 px-3 py-2.5 transition hover:bg-slate-50 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-50/40">
                        <div className="flex items-center gap-2.5">
                          <input type="radio" name={`q_${q.id}`} value={ans.id} checked={a.selectedIds[0] === ans.id}
                            onChange={() => setSelected(q.id, ans.id)} className="h-4 w-4 shrink-0 accent-violet-600" />
                          <span className="text-sm text-slate-800">{ans.text}</span>
                        </div>
                        {ans.imageUrl && <QuizImage url={ans.imageUrl} alt="Answer image" />}
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'MULTI_ANSWER' && (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="mb-1 text-xs text-slate-500">Select all that apply</p>
                    {q.answers.map((ans) => (
                      <label key={ans.id} className="flex cursor-pointer flex-col gap-1 rounded-xl border border-slate-200 px-3 py-2.5 transition hover:bg-slate-50 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-50/40">
                        <div className="flex items-center gap-2.5">
                          <input type="checkbox" value={ans.id} checked={a.selectedIds.includes(ans.id)}
                            onChange={() => toggleSelected(q.id, ans.id)} className="h-4 w-4 shrink-0 accent-violet-600" />
                          <span className="text-sm text-slate-800">{ans.text}</span>
                        </div>
                        {ans.imageUrl && <QuizImage url={ans.imageUrl} alt="Answer image" />}
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'OPEN_ANSWER' && (
                  <textarea value={a.openText} onChange={(e) => setOpenText(q.id, e.target.value)}
                    rows={4} maxLength={10000} placeholder="Write your answer here…"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                )}
              </motion.div>
            );
          })}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end pb-8">
            <button type="button" onClick={() => void handleManualSubmit()} disabled={saving}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              {saving ? 'Saving…' : 'Submit quiz'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
