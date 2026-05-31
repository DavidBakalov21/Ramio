'use client';

import { useState } from 'react';
import { MessageSquarePlus, Trash2, Send } from 'lucide-react';
import type { FileComment } from '@/app/interfaces/Project';

interface ProjectCodeViewerProps {
  filePath: string;
  content: string;
  truncated: boolean;
  comments: FileComment[];
  isTeacher: boolean;
  onAddComment: (
    lineStart: number,
    lineEnd: number,
    body: string,
  ) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

interface CommentFormState {
  lineStart: number;
  lineEnd: number;
  body: string;
  saving: boolean;
}

export function ProjectCodeViewer({
  filePath,
  content,
  truncated,
  comments,
  isTeacher,
  onAddComment,
  onDeleteComment,
}: ProjectCodeViewerProps) {
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [commentForm, setCommentForm] = useState<CommentFormState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lineStartInput, setLineStartInput] = useState('');
  const [lineEndInput, setLineEndInput] = useState('');

  const lines = content.split('\n');
  const totalLines = lines.length;

  const commentsByAnchor = comments.reduce<Record<number, FileComment[]>>(
    (acc, c) => {
      if (c.filePath !== filePath) return acc;
      const key = c.lineEnd ?? c.lineStart;
      if (!acc[key]) acc[key] = [];
      acc[key].push(c);
      return acc;
    },
    {},
  );

  const commentRangeSet = new Set<number>();
  for (const c of comments) {
    if (c.filePath !== filePath) continue;
    const end = c.lineEnd ?? c.lineStart;
    for (let i = c.lineStart; i <= end; i++) commentRangeSet.add(i);
  }

  const openForm = (line: number) => {
    setCommentForm({ lineStart: line, lineEnd: line, body: '', saving: false });
    setLineStartInput(String(line));
    setLineEndInput(String(line));
  };

  const handleSubmit = async () => {
    if (!commentForm || !commentForm.body.trim()) return;
    const lineStart = Math.min(commentForm.lineStart, commentForm.lineEnd);
    const lineEnd = Math.max(commentForm.lineStart, commentForm.lineEnd);
    setCommentForm((f) => (f ? { ...f, saving: true } : null));
    try {
      await onAddComment(lineStart, lineEnd, commentForm.body.trim());
      setCommentForm(null);
    } catch {
      setCommentForm((f) => (f ? { ...f, saving: false } : null));
    }
  };

  const handleDeleteComment = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteComment(id);
    } finally {
      setDeletingId(null);
    }
  };

  const clampLine = (val: number) =>
    Math.max(1, Math.min(totalLines, val || 1));

  const formAnchorLine = commentForm
    ? Math.max(commentForm.lineStart, commentForm.lineEnd)
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <span className="font-mono text-xs text-slate-500">{filePath}</span>
        {truncated && (
          <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            truncated at 100 KB
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-xs leading-5">
          <tbody>
            {lines.map((line, idx) => {
              const lineNum = idx + 1;
              const lineComments = commentsByAnchor[lineNum] ?? [];

              const inFormRange =
                commentForm &&
                lineNum >=
                  Math.min(commentForm.lineStart, commentForm.lineEnd) &&
                lineNum <= Math.max(commentForm.lineStart, commentForm.lineEnd);
              const inCommentRange = commentRangeSet.has(lineNum);
              const isFormAnchor = formAnchorLine === lineNum;

              let rowBg = '';
              if (inFormRange) rowBg = 'bg-violet-50/70';
              else if (inCommentRange) rowBg = 'bg-amber-50/60';
              else if (hoveredLine === lineNum) rowBg = 'bg-slate-50';

              return [
                <tr
                  key={`line-${lineNum}`}
                  className={rowBg}
                  onMouseEnter={() => setHoveredLine(lineNum)}
                  onMouseLeave={() => setHoveredLine(null)}
                >
                  <td className="w-10 select-none border-r border-slate-100 pr-2 text-right text-slate-400">
                    {lineNum}
                  </td>

                  {isTeacher && (
                    <td className="w-6 pl-1">
                      {hoveredLine === lineNum && !commentForm && (
                        <button
                          type="button"
                          onClick={() => openForm(lineNum)}
                          title="Add comment"
                          className="rounded p-0.5 text-violet-400 hover:bg-violet-100 hover:text-violet-600"
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}

                  <td className="whitespace-pre pl-3 pr-4 text-slate-800">
                    {line || ' '}
                  </td>
                </tr>,

                ...(isFormAnchor && commentForm
                  ? [
                      <tr key={`form-${lineNum}`} className="bg-violet-50">
                        <td colSpan={isTeacher ? 3 : 2} className="px-3 py-2">
                          <div className="flex flex-col gap-2.5 rounded-lg border border-violet-200 bg-white p-3 shadow-sm max-w-lg">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-semibold text-violet-700 shrink-0">
                                Comment on lines
                              </span>
                              <input
                                type="number"
                                min={1}
                                max={totalLines}
                                value={lineStartInput}
                                onChange={(e) =>
                                  setLineStartInput(e.target.value)
                                }
                                onBlur={() => {
                                  const val = clampLine(Number(lineStartInput));
                                  setLineStartInput(String(val));
                                  setCommentForm((f) =>
                                    f ? { ...f, lineStart: val } : null,
                                  );
                                }}
                                className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-center text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                              />
                              <span className="text-[11px] text-slate-500 shrink-0">
                                to
                              </span>
                              <input
                                type="number"
                                min={1}
                                max={totalLines}
                                value={lineEndInput}
                                onChange={(e) =>
                                  setLineEndInput(e.target.value)
                                }
                                onBlur={() => {
                                  const val = clampLine(Number(lineEndInput));
                                  setLineEndInput(String(val));
                                  setCommentForm((f) =>
                                    f ? { ...f, lineEnd: val } : null,
                                  );
                                }}
                                className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-center text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                              />
                              <span className="text-[10px] text-slate-400 shrink-0">
                                (of {totalLines})
                              </span>
                            </div>

                            <textarea
                              autoFocus
                              rows={3}
                              value={commentForm.body}
                              onChange={(e) =>
                                setCommentForm((f) =>
                                  f ? { ...f, body: e.target.value } : null,
                                )
                              }
                              onKeyDown={(e) => {
                                if (
                                  e.key === 'Enter' &&
                                  (e.ctrlKey || e.metaKey)
                                ) {
                                  void handleSubmit();
                                }
                              }}
                              placeholder="Write a comment… (Ctrl+Enter to submit)"
                              className="w-full resize-none rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-400"
                            />

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={
                                  commentForm.saving || !commentForm.body.trim()
                                }
                                onClick={() => void handleSubmit()}
                                className="flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                              >
                                <Send className="h-3 w-3" />
                                {commentForm.saving ? 'Saving…' : 'Add comment'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCommentForm(null)}
                                className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>,
                    ]
                  : []),

                ...lineComments.map((c) => (
                  <tr key={`comment-${c.id}`} className="bg-amber-50">
                    <td colSpan={isTeacher ? 3 : 2} className="px-3 py-1.5">
                      <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                            {(c.author.username ??
                              c.author.email)[0].toUpperCase()}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-700">
                            {c.author.username ?? c.author.email}
                          </span>
                          {c.lineEnd && c.lineEnd !== c.lineStart && (
                            <span className="rounded bg-violet-100 px-1 py-0 text-[10px] text-violet-600">
                              Lines {c.lineStart}–{c.lineEnd}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-700">
                          {c.body}
                        </p>
                        {isTeacher && (
                          <div className="mt-2">
                            <button
                              type="button"
                              disabled={deletingId === c.id}
                              onClick={() => void handleDeleteComment(c.id)}
                              className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                            >
                              <Trash2 className="h-3 w-3" />
                              {deletingId === c.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>

      {!isTeacher &&
        comments.filter((c) => c.filePath === filePath).length === 0 && (
          <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
            No comments on this file yet
          </div>
        )}
    </div>
  );
}
