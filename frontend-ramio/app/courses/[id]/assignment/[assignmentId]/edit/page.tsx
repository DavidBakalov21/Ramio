'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { Assignment, AssignmentLanguage, TestFileInfo } from '@/app/interfaces/Assignment';
import { SubmissionListItem } from '@/app/interfaces/Submission';
import { ASSIGNMENT_LANGUAGE_MAP, getAssignmentLanguageFileExtension } from '@/app/constants/assignmentLanguages';
import { useToast } from '@/app/components/utility/toast';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';

const ALL_LANGUAGES = Object.keys(ASSIGNMENT_LANGUAGE_MAP) as AssignmentLanguage[];

const LANGUAGE_MIME_TYPE: Record<AssignmentLanguage, string> = {
  PYTHON: 'text/x-python',
  NODE_JS: 'text/javascript',
  JAVA: 'text/x-java-source',
  DOTNET: 'text/plain',
};

export default function EditAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const courseId = params.id as string;
  const assignmentId = params.assignmentId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(100);
  const [dueDate, setDueDate] = useState('');

  // Per-language test state
  const [activeTestTab, setActiveTestTab] = useState<AssignmentLanguage>('PYTHON');
  // Map of language → { code, file, saving, generating, deleting, loaded }
  const [testStates, setTestStates] = useState<
    Record<AssignmentLanguage, {
      code: string;
      file: File | null;
      saving: boolean;
      generating: boolean;
      deleting: boolean;
      loaded: boolean;
    }>
  >(() => {
    const init = {} as Record<AssignmentLanguage, { code: string; file: File | null; saving: boolean; generating: boolean; deleting: boolean; loaded: boolean }>;
    for (const lang of ALL_LANGUAGES) {
      init[lang] = { code: '', file: null, saving: false, generating: false, deleting: false, loaded: false };
    }
    return init;
  });
  const [configuredTests, setConfiguredTests] = useState<TestFileInfo[]>([]);

  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const setTestField = <K extends keyof typeof testStates[AssignmentLanguage]>(
    lang: AssignmentLanguage,
    field: K,
    value: typeof testStates[AssignmentLanguage][K],
  ) => {
    setTestStates((prev) => ({ ...prev, [lang]: { ...prev[lang], [field]: value } }));
  };

  useEffect(() => {
    if (!user || !assignmentId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [assignmentRes, subsRes] = await Promise.all([
          api.get<Assignment>(`/assignment/${assignmentId}`),
          api.get<SubmissionListItem[]>(`/assignment/${assignmentId}/submissions`),
        ]);
        const a = assignmentRes.data;
        setTitle(a.title);
        setDescription(a.description ?? '');
        setPoints(a.points);
        setDueDate(a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : '');
        setConfiguredTests(a.tests ?? []);
        setActiveTestTab(a.language);
        setSubmissions(subsRes.data);
      } catch {
        setError('Failed to load assignment.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user, assignmentId]);

  // Lazy-load test file content when switching tabs
  useEffect(() => {
    if (!assignmentId) return;
    const isConfigured = configuredTests.some((t) => t.language === activeTestTab);
    if (!isConfigured) return;
    if (testStates[activeTestTab].loaded) return;

    const loadContent = async () => {
      try {
        const res = await api.get<string>(`/assignment/${assignmentId}/test-file/${activeTestTab}`);
        setTestField(activeTestTab, 'code', typeof res.data === 'string' ? res.data : String(res.data ?? ''));
        setTestField(activeTestTab, 'loaded', true);
      } catch {
        /* silently ignore */
      }
    };
    void loadContent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTestTab, configuredTests, assignmentId]);

  const reloadSubmissions = async () => {
    setSubmissionsLoading(true);
    try {
      const res = await api.get<SubmissionListItem[]>(`/assignment/${assignmentId}/submissions`);
      setSubmissions(res.data);
    } catch {
      setSubmissions([]);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const dueDateSeconds = dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : null;
      await api.patch(`/assignment/${assignmentId}`, {
        title: title.trim(),
        description: description.trim() || undefined,
        points,
        dueDate: dueDateSeconds,
      });
      showToast('Assignment updated.', 'success');
      await reloadSubmissions();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveTest = async (lang: AssignmentLanguage) => {
    const state = testStates[lang];
    setTestField(lang, 'saving', true);
    try {
      const ext = getAssignmentLanguageFileExtension(lang);
      let fileToUpload: File | null = state.file;
      if (!fileToUpload && state.code.trim()) {
        fileToUpload = new File([state.code], `test.${ext}`, { type: LANGUAGE_MIME_TYPE[lang] });
      }
      if (!fileToUpload) { showToast('No test code to save.', 'error'); return; }
      const form = new FormData();
      form.append('file', fileToUpload);
      await api.post(`/assignment/${assignmentId}/test-file/${lang}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTestField(lang, 'file', null);
      setTestField(lang, 'loaded', true);
      // Reload configured tests list
      const res = await api.get<Assignment>(`/assignment/${assignmentId}`);
      setConfiguredTests(res.data.tests ?? []);
      showToast(`${ASSIGNMENT_LANGUAGE_MAP[lang].label} test saved.`, 'success');
    } catch {
      showToast('Failed to save test.', 'error');
    } finally {
      setTestField(lang, 'saving', false);
    }
  };

  const handleDeleteTest = async (lang: AssignmentLanguage) => {
    if (!confirm(`Delete the ${ASSIGNMENT_LANGUAGE_MAP[lang].label} test file?`)) return;
    setTestField(lang, 'deleting', true);
    try {
      await api.delete(`/assignment/${assignmentId}/test-file/${lang}`);
      setTestField(lang, 'code', '');
      setTestField(lang, 'file', null);
      setTestField(lang, 'loaded', false);
      setConfiguredTests((prev) => prev.filter((t) => t.language !== lang));
      showToast(`${ASSIGNMENT_LANGUAGE_MAP[lang].label} test deleted.`, 'success');
    } catch {
      showToast('Failed to delete test.', 'error');
    } finally {
      setTestField(lang, 'deleting', false);
    }
  };

  const handleGenerateTest = async (lang: AssignmentLanguage) => {
    setTestField(lang, 'generating', true);
    try {
      const res = await api.post<{ code: string }>(`/assignment/${assignmentId}/test-file/${lang}/generate`);
      setTestField(lang, 'code', res.data.code ?? '');
      setTestField(lang, 'file', null);
      showToast('AI test generated — review and save.', 'success');
    } catch {
      showToast('Failed to generate tests.', 'error');
    } finally {
      setTestField(lang, 'generating', false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this assignment? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.delete(`/assignment/${assignmentId}`);
      showToast('Assignment deleted.', 'success');
      router.push(`/courses/${courseId}`);
    } catch {
      setError('Failed to delete assignment.');
    } finally {
      setDeleting(false);
    }
  };

  if (loadingUser || loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  }
  if (!user) return null;

  return (
    <TeacherPageShell user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
      <button type="button" onClick={() => router.push(`/courses/${courseId}`)} className="mb-3 self-start text-xs font-medium text-slate-500 hover:text-slate-700">← Back to course</button>
      <h1 className="text-xl font-semibold text-slate-900">Edit assignment</h1>

      <form onSubmit={handleSave} className="mt-5 grid gap-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Points" />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>

        {/* Per-language test files */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50">
          <div className="border-b border-slate-200 px-3 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-600">Test files <span className="text-slate-400 font-normal">(per language — students pick their language)</span></p>
            <div className="flex gap-1 flex-wrap">
              {ALL_LANGUAGES.map((lang) => {
                const configured = configuredTests.some((t) => t.language === lang);
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
                    {configured && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active tab content */}
          {ALL_LANGUAGES.map((lang) => {
            if (lang !== activeTestTab) return null;
            const state = testStates[lang];
            const configured = configuredTests.find((t) => t.language === lang);
            const canSave = !!(state.file || state.code.trim());

            return (
              <div key={lang} className="p-3 space-y-2">
                {configured ? (
                  <p className="text-xs text-slate-500">
                    Current: <span className="font-medium text-slate-700">{configured.name}</span>
                    <a href={configured.url} target="_blank" rel="noreferrer" className="ml-2 text-violet-600 hover:underline">View</a>
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic">No test configured for {ASSIGNMENT_LANGUAGE_MAP[lang].label} yet.</p>
                )}

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
                  onChange={(e) => { setTestField(lang, 'code', e.target.value); if (e.target.value) setTestField(lang, 'file', null); }}
                  rows={8}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
                  placeholder={ASSIGNMENT_LANGUAGE_MAP[lang].testCodePlaceholder}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canSave || state.saving}
                    onClick={() => void handleSaveTest(lang)}
                    className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {state.saving ? 'Saving…' : 'Save test'}
                  </button>

                  <button
                    type="button"
                    disabled={state.generating}
                    onClick={() => void handleGenerateTest(lang)}
                    className="rounded-full border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                  >
                    {state.generating ? 'Generating…' : 'Generate with AI'}
                  </button>

                  {configured && (
                    <button
                      type="button"
                      disabled={state.deleting}
                      onClick={() => void handleDeleteTest(lang)}
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {state.deleting ? 'Deleting…' : 'Delete test'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submissions list */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-600">Submissions</p>
          {submissionsLoading ? (
            <p className="text-xs text-slate-500">Loading submissions…</p>
          ) : submissions.length === 0 ? (
            <p className="text-xs text-slate-500">No submissions yet.</p>
          ) : (
            <ul className="space-y-2">
              {submissions.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.user.username || s.user.email}</p>
                    <p className="text-xs text-slate-500">
                      {s.language ? <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono">{s.language}</span> : null}
                      {s.isChecked ? `${s.points} pts · Checked` : 'Not assessed yet'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/courses/${courseId}/assignment/${assignmentId}/submission/${s.id}/assess`)}
                    className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                  >
                    Assess
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => void handleDelete()} disabled={deleting || submitting} className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button type="submit" disabled={submitting || deleting} className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </TeacherPageShell>
  );
}
