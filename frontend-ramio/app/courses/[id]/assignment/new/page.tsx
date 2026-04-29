'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useToast } from '@/app/components/utility/toast';
import { AssignmentLanguage } from '@/app/interfaces/Assignment';
import { ASSIGNMENT_LANGUAGE_MAP, getAssignmentLanguageFileExtension } from '@/app/constants/assignmentLanguages';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';

const LANGUAGE_MIME_TYPE: Record<AssignmentLanguage, string> = {
  PYTHON: 'text/x-python',
  NODE_JS: 'text/javascript',
  JAVA: 'text/x-java-source',
  DOTNET: 'text/plain',
};

export default function NewAssignmentPage() {
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
  const [points, setPoints] = useState(100);
  const [language, setLanguage] = useState<AssignmentLanguage>('PYTHON');
  const [testCode, setTestCode] = useState('');
  const [generatingTests, setGeneratingTests] = useState(false);

  useEffect(() => {
    if (!user?.role || !courseId) return;
    const checkCourseAccess = async () => {
      try {
        const res = await api.get<{ isTeacher: boolean }>(`/course/${courseId}`);
        setCourseAllowed(!!res.data.isTeacher);
      } catch {
        setCourseAllowed(false);
      }
    };
    void checkCourseAccess();
  }, [user?.role, courseId]);

  const handleGenerateTests = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      setError('Enter a description first to generate tests.');
      return;
    }
    setError('');
    setGeneratingTests(true);
    try {
      const languageMap: Record<AssignmentLanguage, 'python' | 'javascript' | 'java' | 'csharp'> = {
        PYTHON: 'python',
        NODE_JS: 'javascript',
        JAVA: 'java',
        DOTNET: 'csharp',
      };
      const res = await api.post<{ tests: string }>(
        '/code-test/generate-tests-from-description',
        { description: trimmed, language: languageMap[language] },
      );
      setTestCode(res.data.tests ?? '');
      showToast('Tests generated.', 'success');
    } catch {
      setError('Failed to generate tests.');
    } finally {
      setGeneratingTests(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const created = await api.post<{ id: string }>('/assignment', {
        title: trimmedTitle,
        description: description.trim() || undefined,
        points,
        language,
        courseId: Number(courseId),
      });

      if (testCode.trim()) {
        const ext = getAssignmentLanguageFileExtension(language);
        const file = new File([testCode], `test.${ext}`, {
          type: LANGUAGE_MIME_TYPE[language],
        });
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/assignment/${created.data.id}/test-file`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      showToast('Assignment created.', 'success');
      router.push(`/courses/${courseId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to create assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingUser || courseAllowed === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  }
  if (!user) return null;
  if (!courseAllowed) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Only course teacher can create assignments.</div>;
  }

  return (
    <TeacherPageShell user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
          <button
            type="button"
            onClick={() => router.push(`/courses/${courseId}`)}
            className="mb-3 self-start text-xs font-medium text-slate-500 transition hover:text-slate-700"
          >
            ← Back to course
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Create assignment</h1>
          <p className="mt-1 text-sm text-slate-500">Use a full page editor for faster setup and test preparation.</p>

          <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Assignment title"
              maxLength={255}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What students should implement"
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="number"
                min={0}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as AssignmentLanguage)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {Object.entries(ASSIGNMENT_LANGUAGE_MAP).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Test code (optional)</p>
                <button
                  type="button"
                  onClick={() => void handleGenerateTests()}
                  disabled={generatingTests || submitting}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {generatingTests ? 'Generating…' : 'Generate from description'}
                </button>
              </div>
              <textarea
                value={testCode}
                onChange={(e) => setTestCode(e.target.value)}
                rows={12}
                placeholder={ASSIGNMENT_LANGUAGE_MAP[language].testCodePlaceholder}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push(`/courses/${courseId}`)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? 'Creating…' : 'Create assignment'}
              </button>
            </div>
          </form>
    </TeacherPageShell>
  );
}

