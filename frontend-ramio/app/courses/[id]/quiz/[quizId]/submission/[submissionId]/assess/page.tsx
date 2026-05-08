'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';
import { QuizSubmissionDetail } from '@/app/interfaces/Quiz';
import { QuizImage } from '@/app/components/quizzes/QuizImage';

export default function AssessQuizSubmissionPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const quizId = params.quizId as string;
  const submissionId = params.submissionId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [submission, setSubmission] = useState<QuizSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [openPoints, setOpenPoints] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchSubmission = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const res = await api.get<QuizSubmissionDetail>(`/quiz/submission/${submissionId}`);
      setSubmission(res.data);
      const initial: Record<string, string> = {};
      for (const q of res.data.questions) {
        if (q.type === 'OPEN_ANSWER') initial[q.id] = q.pointsEarned != null ? String(q.pointsEarned) : '';
      }
      setOpenPoints(initial);
    } catch {
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => { if (user) void fetchSubmission(); }, [user, fetchSubmission]);

  const handleSave = async () => {
    if (!submission) return;
    setError('');
    setSaving(true);
    try {
      const answersToAssess = submission.questions
        .filter((q) => q.type === 'OPEN_ANSWER')
        .map((q) => ({ questionId: Number(q.id), pointsEarned: Number(openPoints[q.id] ?? 0) || 0 }));
      await api.patch(`/quiz/submission/${submissionId}/assess`, { answers: answersToAssess });
      router.push(`/courses/${courseId}/quiz/${quizId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to save assessment.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingUser) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  if (!user) return null;

  return (
    <TeacherPageShell user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
      <button type="button" onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}`)}
        className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700">
        ← Back to quiz
      </button>
      <h1 className="text-xl font-semibold text-slate-900">Assess submission</h1>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : !submission ? (
        <p className="mt-4 text-sm text-slate-600">Submission not found.</p>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-sm font-medium text-slate-900">{submission.username || submission.email}</p>
            {submission.username && <p className="text-xs text-slate-500">{submission.email}</p>}
            <p className="mt-1 text-xs text-slate-500">
              Submitted: {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '—'}
            </p>
            {submission.totalPoints != null && (
              <p className="mt-1 text-xs font-medium text-slate-700">
                Current score: {Math.round(submission.totalPoints * 100) / 100} / {submission.totalMax}
              </p>
            )}
          </div>

          {submission.questions.map((q, idx) => (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{idx + 1}. {q.text}</p>
                <span className="shrink-0 text-xs text-slate-500">{q.points} pts</span>
              </div>
              {q.imageUrl && <QuizImage url={q.imageUrl} alt={`Question ${idx + 1} image`} />}

              {(q.type === 'ONE_ANSWER' || q.type === 'MULTI_ANSWER') && (
                <div className="mt-3 flex flex-col gap-2">
                  {q.answers.map((a) => {
                    let bg = 'border-slate-200';
                    if (a.isCorrect && a.isSelected) bg = 'border-emerald-400 bg-emerald-50';
                    else if (a.isCorrect) bg = 'border-emerald-200 bg-emerald-50/60';
                    else if (a.isSelected) bg = 'border-red-300 bg-red-50';
                    return (
                      <div key={a.id} className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 ${bg}`}>
                        <div className="flex items-center gap-2.5">
                          <span className="flex-1 text-sm text-slate-800">{a.text}</span>
                          <div className="flex shrink-0 gap-2 text-xs">
                            {a.isSelected && <span className="font-medium text-violet-600">Selected</span>}
                            {a.isCorrect && <span className="font-medium text-emerald-600">Correct</span>}
                          </div>
                        </div>
                        {a.imageUrl && <QuizImage url={a.imageUrl} alt="Answer image" />}
                      </div>
                    );
                  })}
                  {q.pointsEarned != null && (
                    <p className="mt-1 text-xs text-slate-600">
                      Auto-graded: <span className="font-medium">{Math.round(q.pointsEarned * 100) / 100} / {q.points} pts</span>
                    </p>
                  )}
                </div>
              )}

              {q.type === 'OPEN_ANSWER' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="mb-1 text-xs font-medium text-slate-500">Student's answer:</p>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">
                      {q.openText || <span className="italic text-slate-400">(no answer written)</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600">Points awarded:</label>
                    <input type="number" min={0} max={q.points} step="any"
                      value={openPoints[q.id] ?? ''}
                      onChange={(e) => setOpenPoints((p) => ({ ...p, [q.id]: e.target.value }))}
                      className="w-24 rounded-xl border border-slate-200 px-2 py-1.5 text-sm focus:border-violet-500 focus:outline-none" />
                    <span className="text-xs text-slate-500">/ {q.points} max</span>
                  </div>
                </div>
              )}
            </div>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pb-8">
            <button type="button" onClick={() => router.push(`/courses/${courseId}/quiz/${quizId}`)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm">
              Cancel
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving || !submission}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? 'Saving…' : 'Save assessment'}
            </button>
          </div>
        </div>
      )}
    </TeacherPageShell>
  );
}
