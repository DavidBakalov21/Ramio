import AdmZip from 'adm-zip';
import { zipContainsGitDir } from './submission-git.util';

function buildZip(entries: { path: string; content?: string }[]): Buffer {
  const zip = new AdmZip();
  for (const entry of entries) {
    zip.addFile(entry.path, Buffer.from(entry.content ?? ''));
  }
  return zip.toBuffer();
}

describe('zipContainsGitDir', () => {
  it('zip containing a ".git/..." entry → true', () => {
    const buffer = buildZip([{ path: '.git/config', content: '[core]' }]);
    expect(zipContainsGitDir(buffer)).toBe(true);
  });

  it('zip with backslash path ".git\\config" → normalised → true', () => {
    const buffer = buildZip([{ path: '.git\\config', content: '[core]' }]);
    expect(zipContainsGitDir(buffer)).toBe(true);
  });

  it('zip with no .git entries → false', () => {
    const buffer = buildZip([
      { path: 'src/main.py', content: 'print("hi")' },
      { path: 'README.md', content: '# Project' },
    ]);
    expect(zipContainsGitDir(buffer)).toBe(false);
  });

  it('zip containing only ".gitignore" (no ".git/" dir) → false', () => {
    const buffer = buildZip([{ path: '.gitignore', content: 'node_modules/' }]);
    expect(zipContainsGitDir(buffer)).toBe(false);
  });
});
