'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { Assignment } from '@/app/interfaces/Assignment';
import {
  getAssignmentLanguageLabel,
  getAssignmentLanguageFileExtension,
} from '@/app/constants/assignmentLanguages';
import { User } from '@/app/interfaces/User';
import { Navbar } from '@/app/components/Navbar';

type RunResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export default function AssignmentSandboxPage() {
  const params = useParams();
  const router = useRouter();
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
  const [submitMessage, setSubmitMessage] = useState<'success' | 'error' | null>(null);
  const [lastSubmitWasUpdate, setLastSubmitWasUpdate] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
      user?.role !== 'STUDENT' ||
      !assignment.submitted
    ) {
      return;
    }
    const fetchSubmission = async () => {
      try {
        const res = await api.get<{ solutionContent?: string | null }>(
          `/assignment/${assignmentId}/submission`,
        );
        if (res.data.solutionContent != null) {
          setCode(res.data.solutionContent);
        }
      } catch {
        console.error('Failed to fetch submission');
      }
    };
    fetchSubmission();
  }, [assignmentId, assignment?.id, assignment?.submitted, user?.role]);

  const handleSubmit = async () => {
    if (!assignment) return;
    setSubmitMessage(null);
    setError('');
    setIsSubmitting(true);
    const isUpdate = !!assignment.submitted;
    try {
      const ext = getAssignmentLanguageFileExtension(assignment.language);
      const filename = `solution.${ext}`;
      const file = new File([code], filename, {
        type: ext === 'py' ? 'text/x-python' : 'text/javascript',
      });
      const formData = new FormData();
      formData.append('files', file);
      if (isUpdate) {
        await api.patch(`/assignment/${assignmentId}/submission`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setLastSubmitWasUpdate(true);
        setSubmitMessage('success');
        setTimeout(() => setSubmitMessage(null), 4000);
      } else {
        await api.post(`/assignment/${assignmentId}/submission`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setLastSubmitWasUpdate(false);
        setSubmitMessage('success');
        setAssignment((prev) => (prev ? { ...prev, submitted: true } : null));
        setTimeout(() => setSubmitMessage(null), 4000);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      setSubmitMessage('error');
      setError(
        status === 409
          ? 'You have already submitted this assignment.'
          : (msg as string) || 'Failed to submit',
      );
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
      const { data } = await api.post<RunResult>(`/assignment/${assignmentId}/run`, { code });
      setResult(data);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      setError(msg || 'Failed to run tests');
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

  if (loadingUser || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

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
            <p className="text-sm text-slate-500">Loading assignment…</p>
          ) : !assignment ? (
            <div className="text-center">
              <p className="text-sm text-slate-600">Assignment not found or you don’t have access.</p>
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
                <h1 className="text-xl font-semibold text-slate-900">{assignment.title}</h1>
                {assignment.description && (
                  <p className="mt-2 text-sm text-slate-600">{assignment.description}</p>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  {assignment.points} pts · {getAssignmentLanguageLabel(assignment.language)}
                  {assignment.dueDate && ` · Due ${new Date(assignment.dueDate).toLocaleDateString()}`}
                </p>
              </header>

              <div className="space-y-2">
                <label
                  htmlFor="sandbox-code"
                  className="block text-sm font-medium text-slate-700"
                >
                  Your solution
                </label>
                <textarea
                  id="sandbox-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={
                    assignment.language === 'PYTHON'
                      ? '# Write your Python solution here\n# Use the function/class names expected by the tests'
                      : '// Write your solution here'
                  }
                  rows={16}
                  className="block w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
              </div>

              {assignment.language === 'NODE_JS' && (
                <p className="mt-3 text-xs text-amber-700">
                  Running Node.js assignments in the sandbox is not available yet. You can still view the assignment.
                </p>
              )}

              {submitMessage === 'success' && (
                <div className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-700">
                  {lastSubmitWasUpdate
                    ? 'Submission updated.'
                    : 'Assignment submitted successfully.'}
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
                        result.success
                          ? 'text-green-600'
                          : 'text-red-600'
                      }
                    >
                      {result.success ? 'All tests passed' : 'Tests failed'}
                      {result.timedOut ? ' (timed out)' : ''}
                    </span>
                    <span className="text-xs text-slate-500">exit code {result.exitCode}</span>
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
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isRunning || assignment.language === 'NODE_JS'}
                  className="rounded-full border border-violet-300 bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRunning ? 'Running…' : 'Run tests'}
                </button>
                {user.role === 'STUDENT' && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || !code.trim()}
                    className="rounded-full bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    title={
                      !code.trim()
                        ? 'Write your solution first'
                        : assignment.submitted
                          ? 'Update your submission'
                          : 'Submit for grading'
                    }
                  >
                    {isSubmitting
                      ? assignment.submitted
                        ? 'Updating…'
                        : 'Submitting…'
                      : assignment.submitted
                        ? 'Update submission'
                        : 'Submit assignment'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
