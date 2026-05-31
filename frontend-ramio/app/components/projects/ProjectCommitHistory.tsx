'use client';

import { Loader2 } from 'lucide-react';
import type { SubmissionCommitEntry } from '@/app/interfaces/Project';

interface ProjectCommitHistoryProps {
  commits: SubmissionCommitEntry[];
  loading: boolean;
  error: string | null;
}

function formatCommitDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function ProjectCommitHistory({
  commits,
  loading,
  error,
}: ProjectCommitHistoryProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading commit history…
      </div>
    );
  }

  if (error) {
    return <div className="px-4 py-3 text-sm text-red-500">{error}</div>;
  }

  if (commits.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-500">
        No commits found in this archive.
      </div>
    );
  }

  return (
    <ul
      className="divide-y divide-slate-100 overflow-y-auto"
      style={{ maxHeight: '560px' }}
    >
      {commits.map((commit) => (
        <li key={commit.oid} className="px-4 py-3 hover:bg-slate-50/80">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
              {commit.shortOid}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 line-clamp-2">
                {commit.message.split('\n')[0]}
              </p>
              {commit.message.includes('\n') && (
                <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                  {commit.message.split('\n').slice(1).join(' ').trim()}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {commit.authorName}
                <span className="text-slate-300"> · </span>
                {formatCommitDate(commit.committedAt)}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
