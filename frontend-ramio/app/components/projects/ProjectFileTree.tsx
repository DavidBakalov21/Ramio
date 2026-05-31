'use client';

import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  Folder,
  FolderOpen,
} from 'lucide-react';
import type { SubmissionFileEntry } from '@/app/interfaces/Project';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children: TreeNode[];
}

function buildTree(files: SubmissionFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      let node = current.find((n) => n.name === part);

      if (!node) {
        node = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          type: isFile ? 'file' : 'dir',
          children: [],
        };
        current.push(node);
        current.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      }

      if (!isFile) {
        current = node.children;
      }
    }
  }

  return root;
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    py: '🐍',
    js: '🟨',
    ts: '🔷',
    tsx: '🔷',
    jsx: '🟨',
    cs: '🟣',
    java: '☕',
    cpp: '⚙️',
    c: '⚙️',
    h: '⚙️',
    go: '🐹',
    rs: '🦀',
    rb: '💎',
    php: '🐘',
    swift: '🍎',
    kt: '🟠',
    html: '🌐',
    css: '🎨',
    scss: '🎨',
    json: '📋',
    yaml: '📋',
    yml: '📋',
    toml: '📋',
    xml: '📋',
    md: '📝',
    txt: '📄',
    sql: '🗄️',
    sh: '⚡',
    bash: '⚡',
  };
  return icons[ext] ?? '📄';
}

interface TreeNodeViewProps {
  node: TreeNode;
  selectedPath: string | null;
  commentCounts: Record<string, number>;
  onSelect: (path: string) => void;
  depth?: number;
}

function TreeNodeView({
  node,
  selectedPath,
  commentCounts,
  onSelect,
  depth = 0,
}: TreeNodeViewProps) {
  const [open, setOpen] = useState(depth === 0);

  if (node.type === 'dir') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-slate-600 hover:bg-slate-100"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
          )}
          {open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open && (
          <div>
            {node.children.map((child) => (
              <TreeNodeView
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                commentCounts={commentCounts}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  const count = commentCounts[node.path] ?? 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs transition-colors ${
        isSelected
          ? 'bg-violet-100 text-violet-900'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <FileCode
        className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-violet-600' : 'text-slate-400'}`}
      />
      <span className="truncate">
        {getFileIcon(node.name)} {node.name}
      </span>
      {count > 0 && (
        <span className="ml-auto shrink-0 rounded-full bg-violet-200 px-1.5 py-0 text-[10px] font-semibold text-violet-700">
          {count}
        </span>
      )}
    </button>
  );
}

interface ProjectFileTreeProps {
  files: SubmissionFileEntry[];
  selectedPath: string | null;
  commentCounts: Record<string, number>;
  onSelect: (path: string) => void;
}

export function ProjectFileTree({
  files,
  selectedPath,
  commentCounts,
  onSelect,
}: ProjectFileTreeProps) {
  const tree = buildTree(files);

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-slate-400">
        No code files found
      </div>
    );
  }

  return (
    <div className="overflow-y-auto py-1">
      {tree.map((node) => (
        <TreeNodeView
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          commentCounts={commentCounts}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
