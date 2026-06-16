import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';

const execFileAsync = promisify(execFile);

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const GIT_CLONE_TIMEOUT_MS = 110_000;

function parseGithubUrl(repoUrl) {
  const url = repoUrl.trim().replace(/\.git$/, '');
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/.exec(url);
  if (!m) {
    throw new Error(
      `Invalid GitHub URL: "${repoUrl}". Expected https://github.com/{owner}/{repo}`,
    );
  }
  return { owner: m[1], repo: m[2] };
}

function zipDirectory(dirPath) {
  const zip = new AdmZip();
  zip.addLocalFolder(dirPath);
  return zip.toBuffer();
}

async function cloneRepo(cloneUrl, workDir, branch) {
  const args = ['clone', cloneUrl, workDir];
  const ref = (branch ?? '').trim();
  if (ref && ref !== 'HEAD') {
    args.splice(1, 0, '--branch', ref);
  }

  try {
    await execFileAsync('git', args, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: GIT_CLONE_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err
        ? String(err.stderr)
        : '';
    const msg = err instanceof Error ? err.message : String(err);
    const detail = stderr.trim() || msg;

    if (
      /Authentication failed|could not read Username|Repository not found/i.test(
        detail,
      )
    ) {
      throw new Error(
        'Repository not found, is private, or credentials are required. Only public repos are supported.',
      );
    }
    if (/Remote branch .* not found|not found in upstream/i.test(detail)) {
      throw new Error(`Branch "${ref}" not found in repository.`);
    }
    throw new Error(detail || 'git clone failed');
  }
}

export async function handler(event) {
  let workDir;

  try {
    const input =
      typeof event === 'object' && event !== null && 'repoUrl' in event
        ? event
        : JSON.parse(typeof event === 'string' ? event : '{}');

    const { repoUrl, bucket, key, branch: rawBranch } = input;
    const branch = (rawBranch ?? '').trim();

    if (!repoUrl || !bucket || !key) {
      return { ok: false, error: 'repoUrl, bucket, and key are required' };
    }

    const { owner, repo } = parseGithubUrl(repoUrl);
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;

    workDir = await mkdtemp(join(tmpdir(), `ramio-clone-${randomUUID()}-`));

    await cloneRepo(cloneUrl, workDir, branch);

    const archive = zipDirectory(workDir);
    if (archive.length > MAX_ARCHIVE_BYTES) {
      return {
        ok: false,
        error: `Repository archive exceeds ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB limit.`,
      };
    }

    const s3 = new S3Client({});
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: archive,
        ContentType: 'application/zip',
        Metadata: {
          'github-repo-url': repoUrl,
          'github-ref': branch || 'default',
        },
      }),
    );

    return { ok: true, key, url: `https://${bucket}.s3.amazonaws.com/${key}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
