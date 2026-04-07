/**
 * Lambda: { bucket, key } → S3 GetObject → { ok, projectFilesXml, warnings }
 * Handler in AWS console: index.handler  |  Runtime: Node 20.x
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';
import path from 'node:path';

const IGNORE_LIST = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.DS_Store',
  'package-lock.json',
  '.env',
];

const ALLOWED_EXT = ['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.md'];

const MAX_ZIP_BYTES = 40 * 1024 * 1024;
const MAX_ZIP_ENTRIES_SCANNED = 400;
const MAX_FILES_INCLUDED = 200;
const MAX_SINGLE_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_OUTPUT_CHARS = 320_000;

function isSafeEntryName(entryName) {
  if (!entryName || entryName.length > 512) return false;
  const norm = entryName.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[A-Za-z]:\//.test(norm)) return false;
  return !norm.split('/').some((s) => s === '..');
}

function escapeXmlAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function cdataSafe(content) {
  return content.replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function convertZipBuffer(zipBuffer) {
  const warnings = [];
  let zip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new Error('Invalid or corrupted zip archive');
  }

  const entries = zip.getEntries();
  let out = '<project_files>\n';
  let totalChars = out.length;
  let filesIncluded = 0;
  let scanned = 0;

  for (const zipEntry of entries) {
    if (scanned >= MAX_ZIP_ENTRIES_SCANNED) {
      warnings.push(`Stopped scanning after ${MAX_ZIP_ENTRIES_SCANNED} zip entries`);
      break;
    }
    scanned++;

    if (zipEntry.isDirectory) continue;

    const entryName = zipEntry.entryName;
    if (!isSafeEntryName(entryName)) {
      warnings.push(`Skipped unsafe path: ${entryName}`);
      continue;
    }
    if (IGNORE_LIST.some((ig) => entryName.includes(ig))) continue;

    const ext = path.extname(entryName).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) continue;

    const headerSize = zipEntry.header.size;
    if (typeof headerSize === 'number' && headerSize > MAX_SINGLE_FILE_BYTES) {
      warnings.push(`Skipped large file (header): ${entryName}`);
      continue;
    }

    let content;
    try {
      content = zipEntry.getData();
    } catch {
      warnings.push(`Could not read: ${entryName}`);
      continue;
    }

    if (content.length > MAX_SINGLE_FILE_BYTES) {
      warnings.push(`Skipped large file (${content.length} bytes): ${entryName}`);
      continue;
    }

    let text;
    try {
      text = content.toString('utf8');
    } catch {
      warnings.push(`Skipped non-UTF8 file: ${entryName}`);
      continue;
    }

    const block = `<file path="${escapeXmlAttr(entryName)}">\n<![CDATA[\n${cdataSafe(text)}\n]]>\n</file>\n\n`;
    if (totalChars + block.length > MAX_TOTAL_OUTPUT_CHARS) {
      warnings.push('Output size cap reached; remaining files omitted');
      break;
    }

    out += block;
    totalChars += block.length;
    filesIncluded++;
    if (filesIncluded >= MAX_FILES_INCLUDED) {
      warnings.push(`Included at most ${MAX_FILES_INCLUDED} files`);
      break;
    }
  }

  if (filesIncluded === 0) {
    warnings.push('No eligible text files found in archive');
  }

  out += '</project_files>';
  return { projectFilesXml: out, warnings };
}

export async function handler(event) {
  try {
    const input =
      typeof event === 'object' && event !== null && 'bucket' in event
        ? event
        : JSON.parse(typeof event === 'string' ? event : '{}');

    const bucket = input.bucket;
    const key = input.key;
    if (!bucket || !key) {
      return { ok: false, error: 'bucket and key are required' };
    }

    const s3 = new S3Client({});
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    const stream = obj.Body;
    if (!stream) {
      return { ok: false, error: 'Empty S3 object' };
    }

    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_ZIP_BYTES) {
        return { ok: false, error: `Zip exceeds ${MAX_ZIP_BYTES} bytes` };
      }
      chunks.push(buf);
    }

    const zipBuffer = Buffer.concat(chunks);
    const { projectFilesXml, warnings } = convertZipBuffer(zipBuffer);
    return { ok: true, projectFilesXml, warnings };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
