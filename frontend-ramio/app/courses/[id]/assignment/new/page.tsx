'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { useToast } from '@/app/components/utility/toast';
import { AssignmentLanguage } from '@/app/interfaces/Assignment';
import { ASSIGNMENT_DESCRIPTION_HINT } from '@/app/constants/formFieldHints';
import {
  ASSIGNMENT_LANGUAGE_MAP,
  getAssignmentLanguageFileExtension,
} from '@/app/constants/assignmentLanguages';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';

const ALL_LANGUAGES = Object.keys(
  ASSIGNMENT_LANGUAGE_MAP,
) as AssignmentLanguage[];

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
  const [dueDate, setDueDate] = useState('');

  const [activeTestTab, setActiveTestTab] =
    useState<AssignmentLanguage>('PYTHON');
  const [testStates, setTestStates] = useState<
    Record<
      AssignmentLanguage,
      { code: string; file: File | null; generating: boolean }
    >
  >(() => {
    const init = {} as Record<
      AssignmentLanguage,
      { code: string; file: File | null; generating: boolean }
    >;
    for (const lang of ALL_LANGUAGES) {
      init[lang] = { code: '', file: null, generating: false };
    }
    return init;
  });

  useEffect(() => {
    if (!user?.role || !courseId) return;
    const checkCourseAccess = async () => {
      try {
        const res = await api.get<{ isTeacher: boolean }>(
          `/course/${courseId}`,
        );
        setCourseAllowed(!!res.data.isTeacher);
      } catch {
        setCourseAllowed(false);
      }
    };
    void checkCourseAccess();
  }, [user?.role, courseId]);

  const setTestField = <
    K extends keyof (typeof testStates)[AssignmentLanguage],
  >(
    lang: AssignmentLanguage,
    field: K,
    value: (typeof testStates)[AssignmentLanguage][K],
  ) => {
    setTestStates((prev) => ({
      ...prev,
      [lang]: { ...prev[lang], [field]: value },
    }));
  };

  const handleGenerateTest = async (lang: AssignmentLanguage) => {
    const desc = description.trim();
    if (!desc) {
      setError('Enter a description first to generate tests.');
      return;
    }
    setError('');
    setTestField(lang, 'generating', true);
    try {
      const languageMap: Record<
        AssignmentLanguage,
        'python' | 'javascript' | 'java' | 'csharp'
      > = {
        PYTHON: 'python',
        NODE_JS: 'javascript',
        JAVA: 'java',
        DOTNET: 'csharp',
      };
      const res = await api.post<{ tests: string }>(
        '/code-test/generate-tests-from-description',
        { description: desc, language: languageMap[lang] },
      );
      setTestField(lang, 'code', res.data.tests ?? '');
      setTestField(lang, 'file', null);
      showToast('Tests generated - review before saving.', 'success');
    } catch {
      setError('Failed to generate tests.');
    } finally {
      setTestField(lang, 'generating', false);
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
      const dueDateSeconds = dueDate
        ? Math.floor(new Date(dueDate).getTime() / 1000)
        : null;
      const created = await api.post<{ id: string }>('/assignment', {
        title: trimmedTitle,
        description: description.trim() || undefined,
        points,
        courseId: Number(courseId),
        dueDate: dueDateSeconds,
      });

      for (const lang of ALL_LANGUAGES) {
        const state = testStates[lang];
        let fileToUpload: File | null = state.file;
        if (!fileToUpload && state.code.trim()) {
          const ext = getAssignmentLanguageFileExtension(lang);
          fileToUpload = new File([state.code], `test.${ext}`, {
            type: LANGUAGE_MIME_TYPE[lang],
          });
        }
        if (!fileToUpload) continue;
        const formData = new FormData();
        formData.append('file', fileToUpload);
        await api.post(
          `/assignment/${created.data.id}/test-file/${lang}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
      }

      showToast('Assignment created.', 'success');
      router.push(`/courses/${courseId}`);
    } catch (err: unknown) {
      const msg = (
        err as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      setError(
        Array.isArray(msg)
          ? msg[0]
          : typeof msg === 'string'
            ? msg
            : 'Failed to create assignment.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingUser || courseAllowed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading...
      </div>
    );
  }
  if (!user) return null;
  if (!courseAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Only course teacher can create assignments.
      </div>
    );
  }

  return (
    <TeacherPageShell
      user={user}
      onLogout={handleLogout}
      isLoggingOut={isLoggingOut}
    >
      <button
        type="button"
        onClick={() => router.push(`/courses/${courseId}`)}
        className="mb-3 self-start text-xs font-medium text-slate-500 transition hover:text-slate-700"
      >
        ← Back to course
      </button>
      <h1 className="text-xl font-semibold text-slate-900">
        Create assignment
      </h1>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Assignment title"
          maxLength={255}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Description <span className="text-slate-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What students should implement"
            rows={3}
            maxLength={20000}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {ASSIGNMENT_DESCRIPTION_HINT}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="number"
            min={0}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value) || 0)}
            placeholder="Points"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/50">
          <div className="border-b border-slate-200 px-3 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-600">
              Test files{' '}
              <span className="text-slate-400 font-normal">
                (optional - add one or more language tests)
              </span>
            </p>
            <div className="flex gap-1 flex-wrap">
              {ALL_LANGUAGES.map((lang) => {
                const hasContent = !!(
                  testStates[lang].file || testStates[lang].code.trim()
                );
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setActiveTestTab(lang)}
                    className={`rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTestTab === lang
                        ? 'bg-white border border-b-white border-slate-200 text-slate-900 -mb-px z-10'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {ASSIGNMENT_LANGUAGE_MAP[lang].label}
                    {hasContent && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {ALL_LANGUAGES.map((lang) => {
            if (lang !== activeTestTab) return null;
            const state = testStates[lang];
            return (
              <div key={lang} className="p-3 space-y-2">
                <input
                  type="file"
                  accept=".py,.js,.java,.cs"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setTestField(lang, 'file', f);
                    if (f) setTestField(lang, 'code', '');
                  }}
                  className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-full file:border-0 file:bg-slate-200 file:px-3 file:py-1.5"
                />
                <textarea
                  value={state.code}
                  onChange={(e) => {
                    setTestField(lang, 'code', e.target.value);
                    if (e.target.value) setTestField(lang, 'file', null);
                  }}
                  rows={8}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
                  placeholder={
                    ASSIGNMENT_LANGUAGE_MAP[lang].testCodePlaceholder
                  }
                />
                <button
                  type="button"
                  disabled={state.generating || submitting}
                  onClick={() => void handleGenerateTest(lang)}
                  className="rounded-full border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                >
                  {state.generating ? 'Generating…' : 'Generate with AI'}
                </button>
              </div>
            );
          })}
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
