'use client';

import { useCallback, useEffect, useState } from 'react';
import { Code2, Loader2 } from 'lucide-react';
import { api } from '@/lib/axios';
import type { FileComment, SubmissionFileEntry } from '@/app/interfaces/Project';
import { ProjectFileTree } from './ProjectFileTree';
import { ProjectCodeViewer } from './ProjectCodeViewer';

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

  const [files, setFiles] = useState<SubmissionFileEntry[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

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
    void fetchComments();
  }, [isZip, fetchTree, fetchComments]);

  useEffect(() => {
    if (!selectedPath) return;
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
  }, [submissionId, selectedPath]);

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

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <Code2 className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold text-slate-700">File Explorer</span>
        {loadingComments && (
          <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-slate-400" />
        )}
        {comments.length > 0 && (
          <span className="ml-auto text-[11px] text-slate-400">
            {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loadingTree && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading files…
        </div>
      )}

      {treeError && (
        <div className="px-4 py-3 text-sm text-red-500">{treeError}</div>
      )}

      {!loadingTree && !treeError && (
        <div className="flex" style={{ height: '560px' }}>
          {/* File tree */}
          <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/70">
            <ProjectFileTree
              files={files}
              selectedPath={selectedPath}
              commentCounts={commentCounts}
              onSelect={setSelectedPath}
            />
          </div>

          {/* Code viewer */}
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
