import { BadRequestException } from '@nestjs/common';

jest.mock('../bedrock/bedrock.service', () => ({
  BedrockService: class BedrockService {},
}));
jest.mock('../codebuild/codebuild.service', () => ({
  CodeBuildService: class CodeBuildService {},
  isTerminalCodeBuildStatus: jest.fn(),
}));
jest.mock('./project-zip-to-prompt.service', () => ({
  ProjectZipToPromptService: class ProjectZipToPromptService {},
}));
jest.mock('./github-repo-to-s3.service', () => ({
  GithubRepoToS3Service: class GithubRepoToS3Service {},
}));

import { assertArchiveUpload, isCodeFile } from './project.service';

function mockFile(originalname: string): Express.Multer.File {
  return { originalname } as Express.Multer.File;
}

describe('isCodeFile', () => {
  it('returns true for a known extension', () => {
    expect(isCodeFile('src/main.py')).toBe(true);
    expect(isCodeFile('app.tsx')).toBe(true);
  });

  it('returns true for a known bare filename', () => {
    expect(isCodeFile('Makefile')).toBe(true);
    expect(isCodeFile('dockerfile')).toBe(true);
  });

  it('returns false when there is no extension', () => {
    expect(isCodeFile('README')).toBe(false);
  });

  it('normalises backslash paths', () => {
    expect(isCodeFile('src\\lib\\helper.py')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isCodeFile('SRC/MAIN.PY')).toBe(true);
    expect(isCodeFile('MAKEFILE')).toBe(true);
  });
});

describe('assertArchiveUpload', () => {
  it('accepts .zip', () => {
    expect(() => assertArchiveUpload(mockFile('project.zip'))).not.toThrow();
  });

  it('accepts .tar.gz', () => {
    expect(() => assertArchiveUpload(mockFile('bundle.tar.gz'))).not.toThrow();
  });

  it('accepts .tgz', () => {
    expect(() => assertArchiveUpload(mockFile('bundle.tgz'))).not.toThrow();
  });

  it('accepts .tar.bz2 and .tbz2', () => {
    expect(() => assertArchiveUpload(mockFile('a.tar.bz2'))).not.toThrow();
    expect(() => assertArchiveUpload(mockFile('a.tbz2'))).not.toThrow();
  });

  it('accepts .rar and .7z and .tar', () => {
    expect(() => assertArchiveUpload(mockFile('a.rar'))).not.toThrow();
    expect(() => assertArchiveUpload(mockFile('a.7z'))).not.toThrow();
    expect(() => assertArchiveUpload(mockFile('a.tar'))).not.toThrow();
  });

  it('rejects .exe and .txt', () => {
    expect(() => assertArchiveUpload(mockFile('virus.exe'))).toThrow(
      BadRequestException,
    );
    expect(() => assertArchiveUpload(mockFile('notes.txt'))).toThrow(
      BadRequestException,
    );
  });

  it('rejects uploads with no extension', () => {
    expect(() => assertArchiveUpload(mockFile('archive'))).toThrow(
      BadRequestException,
    );
  });

  it('uses basename from a path in originalname', () => {
    expect(() =>
      assertArchiveUpload(mockFile('C:\\Users\\x\\Downloads\\ok.zip')),
    ).not.toThrow();
    expect(() =>
      assertArchiveUpload(mockFile('/tmp/uploads/bad.exe')),
    ).toThrow(BadRequestException);
  });
});
