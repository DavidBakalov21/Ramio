'use client';

import { useCallback, useEffect, useState } from 'react';
import { Code2, GitCommit, Loader2 } from 'lucide-react';
import { api } from '@/lib/axios';
import type {
  FileComment,
  SubmissionCommitEntry,
  SubmissionCommitsResponse,
  SubmissionFileEntry,
} from '@/app/interfaces/Project';
import { ProjectFileTree } from './ProjectFileTree';
import { ProjectCodeViewer } from './ProjectCodeViewer';
import { ProjectCommitHistory } from './ProjectCommitHistory';

type ExplorerView = 'files' | 'commits';

interface ProjectFileViewerProps {
  submissionId: string;
  submissionName: string;
  isTeacher: boolean;
}

export function ProjectFileViewer({
  submissionId,
  submissionName,
  isTeacher,
}: ProjectFileViewerProps) {
  const isZip = submissionName.toLowerCase().endsWith('.zip');

  const [view, setView] = useState<ExplorerView>('files');
  const [hasGitHistory, setHasGitHistory] = useState(false);

  const [files, setFiles] = useState<SubmissionFileEntry[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [commits, setCommits] = useState<SubmissionCommitEntry[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileTruncated, setFileTruncated] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [comments, setComments] = useState<FileComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const fetchTree = useCallback(async () => {
    setLoadingTree(true);
    setTreeError(null);
    try {
      const res = await api.get<{ files: SubmissionFileEntry[] }>(
        `/project/submission/${submissionId}/files`,
      );
      setFiles(res.data.files);
      if (res.data.files.length > 0) {
        setSelectedPath(res.data.files[0].path);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setTreeError(msg ?? 'Failed to load file tree');
    } finally {
      setLoadingTree(false);
    }
  }, [submissionId]);

  const fetchCommits = useCallback(async () => {
    setLoadingCommits(true);
    setCommitsError(null);
    try {
      const res = await api.get<SubmissionCommitsResponse>(
        `/project/submission/${submissionId}/commits`,
      );
      setHasGitHistory(res.data.hasGitHistory);
      setCommits(res.data.commits);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setCommitsError(msg ?? 'Failed to load commit history');
      setHasGitHistory(false);
      setCommits([]);
    } finally {
      setLoadingCommits(false);
    }
  }, [submissionId]);

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const res = await api.get<FileComment[]>(
        `/project/submission/${submissionId}/comments`,
      );
      setComments(res.data);
    } catch {
      // silently ignore
    } finally {
      setLoadingComments(false);
    }
  }, [submissionId]);

  useEffect(() => {
    if (!isZip) return;
    void fetchTree();
    void fetchCommits();
    void fetchComments();
  }, [isZip, fetchTree, fetchCommits, fetchComments]);

  useEffect(() => {
    if (!selectedPath || view !== 'files') return;
    setLoadingFile(true);
    setFileError(null);
    setFileContent(null);
    api
      .get<{ content: string; truncated: boolean }>(
        `/project/submission/${submissionId}/files/content`,
        { params: { path: selectedPath } },
      )
      .then((res) => {
        setFileContent(res.data.content);
        setFileTruncated(res.data.truncated);
      })
      .catch((e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setFileError(msg ?? 'Failed to load file content');
      })
      .finally(() => setLoadingFile(false));
  }, [submissionId, selectedPath, view]);

  const handleAddComment = async (lineStart: number, lineEnd: number, body: string) => {
    await api.post<FileComment>(`/project/submission/${submissionId}/comments`, {
      filePath: selectedPath,
      lineStart,
      lineEnd: lineEnd !== lineStart ? lineEnd : undefined,
      body,
    });
    await fetchComments();
  };

  const handleDeleteComment = async (commentId: string) => {
    await api.delete(
      `/project/submission/${submissionId}/comments/${commentId}`,
    );
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const commentCounts = comments.reduce<Record<string, number>>((acc, c) => {
    acc[c.filePath] = (acc[c.filePath] ?? 0) + 1;
    return acc;
  }, {});

  if (!isZip) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        <Code2 className="h-4 w-4 shrink-0" />
        File browsing is only available for .zip archives. You can still{' '}
        <a href="#" className="text-violet-600 hover:underline">
          download the archive
        </a>{' '}
        to view it locally.
      </div>
    );
  }

  const showCommitsTab = hasGitHistory || loadingCommits;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <Code2 className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold text-slate-700">Submission</span>

        <div className="ml-2 flex gap-1 rounded-lg bg-slate-200/80 p-0.5">
          <button
            type="button"
            onClick={() => setView('files')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              view === 'files'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Files
          </button>
          {showCommitsTab && (
            <button
              type="button"
              onClick={() => setView('commits')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                view === 'commits'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <GitCommit className="h-3 w-3" />
              Commits
              {!loadingCommits && commits.length > 0 && (
                <span className="text-slate-400">({commits.length})</span>
              )}
            </button>
          )}
        </div>

        {view === 'files' && loadingComments && (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-slate-400" />
        )}
        {view === 'files' && comments.length > 0 && (
          <span className="ml-auto text-[11px] text-slate-400">
            {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {view === 'commits' && (
        <ProjectCommitHistory
          commits={commits}
          loading={loadingCommits}
          error={commitsError}
        />
      )}

      {view === 'files' && loadingTree && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading files…
        </div>
      )}

      {view === 'files' && treeError && (
        <div className="px-4 py-3 text-sm text-red-500">{treeError}</div>
      )}

      {view === 'files' && !loadingTree && !treeError && (
        <div className="flex" style={{ height: '560px' }}>
          <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/70">
            <ProjectFileTree
              files={files}
              selectedPath={selectedPath}
              commentCounts={commentCounts}
              onSelect={setSelectedPath}
            />
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            {!selectedPath && (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                Select a file to view its contents
              </div>
            )}
            {selectedPath && loadingFile && (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
            {selectedPath && fileError && (
              <div className="flex flex-1 items-center justify-center text-sm text-red-500">
                {fileError}
              </div>
            )}
            {selectedPath && !loadingFile && fileContent !== null && (
              <ProjectCodeViewer
                filePath={selectedPath}
                content={fileContent}
                truncated={fileTruncated}
                comments={comments}
                isTeacher={isTeacher}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}