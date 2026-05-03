'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { Assignment, AssignmentLanguage } from '@/app/interfaces/Assignment';
import { SubmissionListItem } from '@/app/interfaces/Submission';
import { ASSIGNMENT_LANGUAGE_MAP, getAssignmentLanguageFileExtension } from '@/app/constants/assignmentLanguages';
import { useToast } from '@/app/components/utility/toast';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { TeacherPageShell } from '@/app/components/layout/TeacherPageShell';

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
  const [testCodeLoading, setTestCodeLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(100);
  const [language, setLanguage] = useState<AssignmentLanguage>('PYTHON');
  const [dueDate, setDueDate] = useState('');
  const [newTestFile, setNewTestFile] = useState<File | null>(null);
  const [newTestCode, setNewTestCode] = useState('');
  const [currentTestName, setCurrentTestName] = useState<string | null>(null);
  const [currentTestUrl, setCurrentTestUrl] = useState<string | null>(null);

  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

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
        setLanguage(a.language);
        setDueDate(a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : '');
        setCurrentTestName(a.test?.name ?? null);
        setCurrentTestUrl(a.test?.url ?? null);
        setSubmissions(subsRes.data);

        if (a.test) {
          setTestCodeLoading(true);
          try {
            const res = await api.get<string>(`/assignment/${assignmentId}/test-file`);
            setNewTestCode(typeof res.data === 'string' ? res.data : String(res.data ?? ''));
          } finally {
            setTestCodeLoading(false);
          }
        }
      } catch {
        setError('Failed to load assignment.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user, assignmentId]);

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
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const dueDateSeconds = dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : null;
      await api.patch(`/assignment/${assignmentId}`, {
        title: title.trim(),
        description: description.trim() || undefined,
        points,
        language,
        dueDate: dueDateSeconds,
      });

      if (newTestFile) {
        const form = new FormData();
        form.append('file', newTestFile);
        await api.post(`/assignment/${assignmentId}/test-file`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else if (newTestCode.trim()) {
        const ext = getAssignmentLanguageFileExtension(language);
        const file = new File([newTestCode], `test.${ext}`, {
          type: LANGUAGE_MIME_TYPE[language],
        });
        const form = new FormData();
        form.append('file', file);
        await api.post(`/assignment/${assignmentId}/test-file`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      showToast('Assignment updated.', 'success');
      await reloadSubmissions();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : typeof msg === 'string' ? msg : 'Failed to save.');
    } finally {
      setSubmitting(false);
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
            <div className="grid gap-3 sm:grid-cols-3">
              <input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <select value={language} onChange={(e) => setLanguage(e.target.value as AssignmentLanguage)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                {(Object.keys(ASSIGNMENT_LANGUAGE_MAP) as AssignmentLanguage[]).map((lang) => (
                  <option key={lang} value={lang}>{ASSIGNMENT_LANGUAGE_MAP[lang].label}</option>
                ))}
              </select>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-600">Test file</p>
              {currentTestName && (
                <p className="mb-2 text-xs text-slate-500">
                  Current: {currentTestName}
                  {currentTestUrl && <a href={currentTestUrl} target="_blank" rel="noreferrer" className="ml-2 text-violet-600 hover:underline">View</a>}
                  {testCodeLoading && ' · Loading…'}
                </p>
              )}
              <input type="file" accept=".py,.js,.java,.cs" onChange={(e) => setNewTestFile(e.target.files?.[0] ?? null)} className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-full file:border-0 file:bg-slate-200 file:px-3 file:py-1.5" />
              <textarea value={newTestCode} onChange={(e) => { setNewTestCode(e.target.value); if (e.target.value) setNewTestFile(null); }} rows={6} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm" placeholder={ASSIGNMENT_LANGUAGE_MAP[language].testCodePlaceholder} />
            </div>

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
                        <p className="text-xs text-slate-500">{s.isChecked ? `${s.points} pts · Checked` : 'Not assessed yet'}</p>
                      </div>
                      <button type="button" onClick={() => router.push(`/courses/${courseId}/assignment/${assignmentId}/submission/${s.id}/assess`)} className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700">
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

