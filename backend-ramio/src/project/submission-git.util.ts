import { mkdtemp, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import git from 'isomorphic-git';
import fs from 'node:fs';

const MAX_COMMITS = 100;

export interface SubmissionCommitEntry {
  oid: string;
  shortOid: string;
  message: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
}

export function zipContainsGitDir(zipBuffer: Buffer): boolean {
  const zip = new AdmZip(zipBuffer);
  return zip.getEntries().some((e) => {
    const name = e.entryName.replace(/\\/g, '/');
    return name === '.git/' || name.startsWith('.git/');
  });
}

export async function readCommitsFromZip(
  zipBuffer: Buffer,
): Promise<{ hasGitHistory: boolean; commits: SubmissionCommitEntry[] }> {
  if (!zipContainsGitDir(zipBuffer)) {
    return { hasGitHistory: false, commits: [] };
  }

  const workDir = await mkdtemp(join(tmpdir(), `ramio-git-${randomUUID()}-`));
  try {
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(workDir, true);

    const gitDir = join(workDir, '.git');
    try {
      await access(gitDir);
    } catch {
      return { hasGitHistory: false, commits: [] };
    }

    const log = await git.log({ fs, dir: workDir, depth: MAX_COMMITS });
    const commits: SubmissionCommitEntry[] = log.map((entry) => {
      const { commit } = entry;
      const author = commit.author;
      const ts = commit.committer.timestamp ?? author.timestamp;
      return {
        oid: entry.oid,
        shortOid: entry.oid.slice(0, 7),
        message: commit.message.trim(),
        authorName: author.name,
        authorEmail: author.email,
        committedAt: new Date(ts * 1000).toISOString(),
      };
    });

    return { hasGitHistory: true, commits };
  } catch {
    return { hasGitHistory: true, commits: [] };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
