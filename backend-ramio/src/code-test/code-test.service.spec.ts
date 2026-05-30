import * as path from 'node:path';

jest.mock('../bedrock/bedrock.service', () => ({
  BedrockService: class BedrockService {},
}));

import { dockerHostBindSource } from './code-test.service';

describe('dockerHostBindSource', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('resolves to an absolute path', () => {
    const result = dockerHostBindSource('relative/dir');
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toContain('relative');
  });

  it('on win32 converts backslashes to forward slashes', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const result = dockerHostBindSource('C:\\tmp\\workspace');
    expect(result).not.toMatch(/\\/);
    expect(result).toContain('C:/tmp/workspace');
  });
});
