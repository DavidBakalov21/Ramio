'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { Assignment } from '@/app/interfaces/Assignment';
import {
  getAssignmentLanguageLabel,
  getAssignmentLanguageFileExtension,
  ASSIGNMENT_LANGUAGE_MAP,
} from '@/app/constants/assignmentLanguages';

const ALL_LANGUAGES = Object.keys(
  ASSIGNMENT_LANGUAGE_MAP,
) as AssignmentLanguage[];
import type { AssignmentLanguage } from '@/app/interfaces/Assignment';
import { User } from '@/app/interfaces/User';
import { SubmissionDetail } from '@/app/interfaces/Submission';
import { Navbar } from '@/app/components/Navbar';
import { useToast } from '@/app/components/utility/toast';

type RunResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

const LANGUAGE_MIME_TYPE: Record<AssignmentLanguage, string> = {
  PYTHON: 'text/x-python',
  NODE_JS: 'text/javascript',
  JAVA: 'text/x-java-source',
  DOTNET: 'text/plain',
};

const CODE_PLACEHOLDER: Record<AssignmentLanguage, string> = {
  PYTHON:
    '# Write your Python solution here\n# Use the function/class names expected by the tests',
  NODE_JS: '// Write your JavaScript solution here',
  JAVA: '// Write your Java solution here',
  DOTNET: '// Write your C# solution here',
};

export default function AssignmentSandboxPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const courseId = params.id as string;
  const assignmentId = params.assignmentId as string;

  const [user, setUser] = useState<User | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<
    'success' | 'error' | null
  >(null);
  const [lastSubmitWasUpdate, setLastSubmitWasUpdate] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [selectedLanguage, setSelectedLanguage] =
    useState<AssignmentLanguage | null>(null);
  const [chatMessages, setChatMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

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
    if (!assignmentId || !user?.role) return;
    const fetchAssignment = async () => {
      setLoadingAssignment(true);
      try {
        const res = await api.get<Assignment>(`/assignment/${assignmentId}`);
        setAssignment(res.data);
        const tests = res.data.tests ?? [];
        const defaultHasTest = tests.some(
          (t) => t.language === res.data.language,
        );
        if (defaultHasTest) {
          setSelectedLanguage(res.data.language);
        } else if (tests.length > 0) {
          setSelectedLanguage(tests[0].language);
        } else {
          setSelectedLanguage(res.data.language);
        }
      } catch {
        setAssignment(null);
      } finally {
        setLoadingAssignment(false);
      }
    };
    fetchAssignment();
  }, [assignmentId, user?.role]);

  useEffect(() => {
    if (
      !assignmentId ||
      !assignment ||
      (user?.role !== 'STUDENT' && user?.role !== 'TEACHER') ||
      !assignment.submitted
    ) {
      return;
    }
    const fetchSubmission = async () => {
      try {
        const res = await api.get<SubmissionDetail>(
          `/assignment/${assignmentId}/submission`,
        );
        setSubmission(res.data);
        if (res.data.solutionContent != null) {
          setCode(res.data.solutionContent);
        }
        if (res.data.language) {
          setSelectedLanguage(res.data.language as AssignmentLanguage);
        }
      } catch {
        console.error('Failed to fetch submission');
      }
    };
    fetchSubmission();
  }, [assignmentId, assignment?.id, assignment?.submitted, user?.role]);

  const effectiveLang = selectedLanguage ?? assignment?.language ?? 'PYTHON';

  const handleSubmit = async () => {
    if (!assignment) return;
    setSubmitMessage(null);
    setError('');
    setIsSubmitting(true);
    const isUpdate = !!assignment.submitted;
    try {
      const ext = getAssignmentLanguageFileExtension(effectiveLang);
      const filename = `solution.${ext}`;
      const file = new File([code], filename, {
        type: LANGUAGE_MIME_TYPE[effectiveLang],
      });
      const formData = new FormData();
      formData.append('files', file);
      formData.append('language', effectiveLang);

      if (isUpdate) {
        await api.patch(`/assignment/${assignmentId}/submission`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setLastSubmitWasUpdate(true);
        setSubmitMessage('success');
        showToast(
          user?.role === 'TEACHER'
            ? 'Teacher solution updated.'
            : 'Submission updated.',
          'success',
        );
        setTimeout(() => setSubmitMessage(null), 4000);
      } else {
        await api.post(`/assignment/${assignmentId}/submission`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setLastSubmitWasUpdate(false);
        setSubmitMessage('success');
        setAssignment((prev) => (prev ? { ...prev, submitted: true } : null));
        showToast(
          user?.role === 'TEACHER'
            ? 'Teacher solution submitted successfully.'
            : 'Code snippet task submitted successfully.',
          'success',
        );
        setTimeout(() => setSubmitMessage(null), 4000);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      const errorMsg =
        status === 409
          ? 'You have already submitted this code snippet task.'
          : (msg as string) || 'Failed to submit';
      setSubmitMessage('error');
      setError(errorMsg);
      showToast(errorMsg, 'error');
      if (status === 409) {
        setAssignment((prev) => (prev ? { ...prev, submitted: true } : null));
      }
      setTimeout(() => setSubmitMessage(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRun = async () => {
    setError('');
    setResult(null);
    setIsRunning(true);
    try {
      const { data } = await api.post<RunResult>(
        `/assignment/${assignmentId}/run`,
        {
          code,
          language: effectiveLang,
        },
      );
      setResult(data);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      const errorMsg = (msg as string) || 'Failed to run tests';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await api.post('/auth/logout');
      router.push('/login');
    } catch {
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isStudent = user?.role === 'STUDENT';
  const isTeacher = user?.role === 'TEACHER';
  const isAssessed = isStudent && !!submission?.isChecked;

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !isAssessed || !assignmentId)
      return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const next = [...chatMessages, userMsg];
    setChatInput('');
    setChatLoading(true);
    setChatError('');
    try {
      const { data } = await api.post<{ reply: string }>(
        `/assignment/${assignmentId}/submission/chat`,
        { messages: next },
      );
      setChatMessages([...next, { role: 'assistant', content: data.reply }]);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      setChatError((msg as string) || 'Could not reach the tutor. Try again.');
    } finally {
      setChatLoading(false);
    }
  };

  if (loadingUser || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  const availableLanguages = assignment?.tests?.map((t) => t.language) ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="rounded-[1.9rem] bg-white/85 p-6 shadow-xl backdrop-blur-sm ring-1 ring-white/60">
          <button
            type="button"
            onClick={() => router.push(`/courses/${courseId}`)}
            className="mb-4 text-xs font-medium text-slate-500 transition hover:text-slate-700"
          >
            ← Back to course
          </button>

          {loadingAssignment ? (
            <p className="text-sm text-slate-500">Loading code snippet task…</p>
          ) : !assignment ? (
            <div className="text-center">
              <p className="text-sm text-slate-600">
                Code snippet task not found or you don&apos;t have access.
              </p>
              <button
                type="button"
                onClick={() => router.push(`/courses/${courseId}`)}
                className="mt-3 text-sm font-medium text-violet-600 hover:underline"
              >
                Back to course
              </button>
            </div>
          ) : (
            <>
              <header className="mb-6">
                <h1 className="text-xl font-semibold text-slate-900">
                  {assignment.title}
                </h1>
                {assignment.description && (
                  <p className="mt-2 text-sm text-slate-600">
                    {assignment.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  {assignment.points} pts
                  {assignment.dueDate &&
                    ` · Due ${new Date(assignment.dueDate).toLocaleDateString()}`}
                </p>
              </header>

              {isStudent && isAssessed ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-green-200 bg-green-50/70 px-4 py-3 text-sm text-green-900">
                    <p className="font-semibold">
                      Your result:{' '}
                      {submission?.points != null ? (
                        <>
                          {submission.points} / {assignment.points} pts
                        </>
                      ) : (
                        'Checked'
                      )}
                    </p>
                    {submission?.language && (
                      <p className="mt-1 text-xs text-green-700">
                        Language:{' '}
                        {getAssignmentLanguageLabel(
                          submission.language as AssignmentLanguage,
                        )}
                      </p>
                    )}
                    {submission?.teacherFeedback && (
                      <p className="mt-1 text-xs whitespace-pre-wrap">
                        {submission.teacherFeedback}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Your submitted solution
                    </p>
                    <pre className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
                      {code || '// No code submitted'}
                    </pre>
                  </div>

                  <div className="rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Discuss this task with AI
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Ask about your grade, mistakes, or how to improve.
                    </p>
                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                      {chatMessages.length === 0 ? (
                        <p className="px-2 py-4 text-center text-xs text-slate-400">
                          Start the conversation below.
                        </p>
                      ) : (
                        chatMessages.map((m, i) => (
                          <div
                            key={i}
                            className={`rounded-lg px-3 py-2 text-sm ${
                              m.role === 'user'
                                ? 'ml-4 bg-violet-100 text-slate-900'
                                : 'mr-4 bg-slate-100 text-slate-800'
                            }`}
                          >
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                              {m.role === 'user' ? 'You' : 'Assistant'}
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap">
                              {m.content}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                    {chatError && (
                      <p className="mt-2 text-xs text-red-600">{chatError}</p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void handleChatSend();
                          }
                        }}
                        placeholder="Ask a question…"
                        rows={2}
                        disabled={chatLoading}
                        className="min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                      <button
                        type="button"
                        onClick={() => void handleChatSend()}
                        disabled={chatLoading || !chatInput.trim()}
                        className="self-end rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {chatLoading ? '…' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <p className="mb-1.5 text-xs font-medium text-slate-600">
                      Choose your language
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_LANGUAGES.map((lang) => {
                        const hasTest = availableLanguages.includes(lang);
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => {
                              setSelectedLanguage(lang);
                              setResult(null);
                            }}
                            className={`relative rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              effectiveLang === lang
                                ? 'border-violet-600 bg-violet-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-700'
                            }`}
                          >
                            {ASSIGNMENT_LANGUAGE_MAP[lang].label}
                            {hasTest && (
                              <span
                                title="Tests available"
                                className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${effectiveLang === lang ? 'bg-white/70' : 'bg-green-500'}`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 mr-1 align-middle" />
                      = tests available for that language
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="sandbox-code"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Your solution
                      {availableLanguages.length > 0 && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-normal text-slate-600">
                          {ASSIGNMENT_LANGUAGE_MAP[effectiveLang].label}
                        </span>
                      )}
                    </label>
                    {effectiveLang === 'PYTHON' && (
                      <p className="text-xs text-slate-500">
                        Your editor is run as{' '}
                        <span className="font-mono">solution.py</span>. Tests
                        use <span className="font-mono">import solution</span> -
                        implement the function/class names expected by the
                        tests.
                      </p>
                    )}
                    <textarea
                      id="sandbox-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={CODE_PLACEHOLDER[effectiveLang]}
                      rows={16}
                      className="block w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                  </div>

                  {submitMessage === 'success' && (
                    <div className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-700">
                      {lastSubmitWasUpdate
                        ? 'Submission updated.'
                        : 'Code snippet task submitted successfully.'}
                    </div>
                  )}
                  {submitMessage === 'error' && (
                    <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                  {error && submitMessage !== 'error' && (
                    <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  {result && (
                    <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            result.success ? 'text-green-600' : 'text-red-600'
                          }
                        >
                          {result.success ? 'All tests passed' : 'Tests failed'}
                          {result.timedOut ? ' (timed out)' : ''}
                        </span>
                        <span className="text-xs text-slate-500">
                          exit code {result.exitCode}
                        </span>
                      </div>
                      {result.stdout && (
                        <pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 font-mono text-xs text-slate-800">
                          {result.stdout}
                        </pre>
                      )}
                      {result.stderr && (
                        <pre className="max-h-64 overflow-auto rounded-lg bg-red-50 p-3 font-mono text-xs text-red-800">
                          {result.stderr}
                        </pre>
                      )}
                    </div>
                  )}

                  <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                    <div className="flex flex-col items-end gap-1">
                      {!availableLanguages.includes(effectiveLang) && (
                        <p className="text-[11px] text-slate-400">
                          No tests added for{' '}
                          {ASSIGNMENT_LANGUAGE_MAP[effectiveLang].label} yet
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleRun()}
                        disabled={
                          isRunning ||
                          !availableLanguages.includes(effectiveLang)
                        }
                        className="rounded-full border border-violet-300 bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isRunning ? 'Running…' : 'Run tests'}
                      </button>
                    </div>
                    {(isStudent || isTeacher) && (
                      <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={isSubmitting || !code.trim()}
                        className="rounded-full bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                        title={
                          !code.trim()
                            ? 'Write your solution first'
                            : assignment.submitted
                              ? isTeacher
                                ? 'Update teacher solution'
                                : 'Update your submission'
                              : isTeacher
                                ? 'Submit teacher solution'
                                : 'Submit for grading'
                        }
                      >
                        {isSubmitting
                          ? assignment.submitted
                            ? 'Updating…'
                            : 'Submitting…'
                          : assignment.submitted
                            ? isTeacher
                              ? 'Update teacher solution'
                              : 'Update submission'
                            : isTeacher
                              ? 'Submit teacher solution'
                              : 'Submit task'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
