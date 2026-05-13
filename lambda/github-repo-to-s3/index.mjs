/**
 * Lambda: { repoUrl, bucket, key, branch? } → GitHub archive download → strip root folder → S3 PutObject
 * Handler in AWS console: index.handler  |  Runtime: Node 22.x
 *
 * Input:
 *   repoUrl  - public GitHub repo URL (https://github.com/owner/repo or with .git suffix)
 *   bucket   - destination S3 bucket name
 *   key      - destination S3 object key (should end with .zip)
 *   branch   - optional branch/tag/ref (defaults to HEAD)
 *
 * Output:
 *   { ok: true,  key, url }          on success
 *   { ok: false, error: string }     on failure
 *
 * Why strip the root folder?
 *   GitHub archives always wrap all files in a top-level "{repo}-{branch}/" directory.
 *   CodeBuild and the AI feedback Lambda expect files at the root of the zip, so
 *   we re-zip the contents without that wrapper before uploading to S3.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024; // 256 MB guard

/**
 * Parse a GitHub repo URL into { owner, repo }.
 * Accepts:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/branch  (branch portion ignored)
 */
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

/**
 * GitHub always produces a ZIP whose every entry starts with "{repo}-{ref}/".
 * This function detects that common prefix and returns it (e.g. "my-project-main/").
 * If no consistent prefix is found, returns an empty string (no stripping).
 */
function detectRootPrefix(zip) {
  const entries = zip.getEntries();
  if (!entries.length) return '';

  // Collect the first path segment of every entry
  const prefixes = new Set(
    entries.map((e) => {
      const name = e.entryName.replace(/\\/g, '/');
      const slash = name.indexOf('/');
      return slash === -1 ? '' : name.slice(0, slash + 1);
    }),
  );

  // Only strip if every single entry shares the same root folder
  if (prefixes.size === 1) {
    const [prefix] = prefixes;
    return prefix;
  }
  return '';
}

/**
 * Re-zip the GitHub archive, stripping the top-level folder so that
 * CodeBuild and the AI Lambda see files at the root (e.g. src/main.py, not repo-main/src/main.py).
 */
function stripRootFolder(githubZipBuffer) {
  const source = new AdmZip(githubZipBuffer);
  const prefix = detectRootPrefix(source);

  if (!prefix) {
    // Nothing to strip — return the original buffer unchanged
    return githubZipBuffer;
  }

  const output = new AdmZip();

  for (const entry of source.getEntries()) {
    const originalName = entry.entryName.replace(/\\/g, '/');

    // Skip the root directory entry itself
    if (originalName === prefix) continue;

    // Remove the prefix from the path
    const strippedName = originalName.startsWith(prefix)
      ? originalName.slice(prefix.length)
      : originalName;

    // Skip empty names (shouldn't happen, but be safe)
    if (!strippedName) continue;

    if (entry.isDirectory) {
      output.addFile(strippedName, Buffer.alloc(0));
    } else {
      output.addFile(strippedName, entry.getData());
    }
  }

  return output.toBuffer();
}

export async function handler(event) {
  try {
    const input =
      typeof event === 'object' && event !== null && 'repoUrl' in event
        ? event
        : JSON.parse(typeof event === 'string' ? event : '{}');

    const { repoUrl, bucket, key, branch: rawBranch } = input;
    const branch = (rawBranch ?? 'HEAD').trim() || 'HEAD';

    if (!repoUrl || !bucket || !key) {
      return { ok: false, error: 'repoUrl, bucket, and key are required' };
    }

    const { owner, repo } = parseGithubUrl(repoUrl);

    // GitHub serves a ready-made ZIP for every public repo — no git binary needed.
    const archiveUrl =
      branch === 'HEAD'
        ? `https://github.com/${owner}/${repo}/archive/HEAD.zip`
        : `https://github.com/${owner}/${repo}/archive/refs/heads/${encodeURIComponent(branch)}.zip`;

    const res = await fetch(archiveUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'ramio-lms/github-repo-to-s3' },
    });

    if (res.status === 404) {
      return {
        ok: false,
        error: `Repository ${owner}/${repo} not found or is private (HTTP 404).`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `GitHub returned HTTP ${res.status} for ${owner}/${repo} archive.`,
      };
    }

    // Buffer the response, enforcing the size cap
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_ARCHIVE_BYTES) {
        return {
          ok: false,
          error: `Repository archive exceeds ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB limit.`,
        };
      }
      chunks.push(buf);
    }

    const rawArchive = Buffer.concat(chunks);

    // Strip the top-level "{repo}-{branch}/" folder GitHub always adds
    const cleanArchive = stripRootFolder(rawArchive);

    const s3 = new S3Client({});
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: cleanArchive,
        ContentType: 'application/zip',
        Metadata: {
          'github-repo-url': repoUrl,
          'github-ref': branch,
        },
      }),
    );

    return { ok: true, key, url: `https://${bucket}.s3.amazonaws.com/${key}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
