import type { Build } from '@aws-sdk/client-codebuild';
import {
  consoleUrlForBuild,
  isTerminalCodeBuildStatus,
  normalizeLogGroupName,
} from './codebuild.service';

describe('isTerminalCodeBuildStatus', () => {
  it('returns true for SUCCEEDED', () => {
    expect(isTerminalCodeBuildStatus('SUCCEEDED')).toBe(true);
  });

  it('returns true for FAILED', () => {
    expect(isTerminalCodeBuildStatus('FAILED')).toBe(true);
  });

  it('returns true for TIMED_OUT', () => {
    expect(isTerminalCodeBuildStatus('TIMED_OUT')).toBe(true);
  });

  it('returns true for STOPPED', () => {
    expect(isTerminalCodeBuildStatus('STOPPED')).toBe(true);
  });

  it('returns true for FAULT', () => {
    expect(isTerminalCodeBuildStatus('FAULT')).toBe(true);
  });

  it('returns false for IN_PROGRESS', () => {
    expect(isTerminalCodeBuildStatus('IN_PROGRESS')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTerminalCodeBuildStatus(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTerminalCodeBuildStatus(undefined)).toBe(false);
  });
});

describe('normalizeLogGroupName', () => {
  it('adds leading slash when missing', () => {
    expect(normalizeLogGroupName('codebuild/my-group')).toBe(
      '/codebuild/my-group',
    );
  });

  it('leaves existing leading slash alone', () => {
    expect(normalizeLogGroupName('/codebuild/my-group')).toBe(
      '/codebuild/my-group',
    );
  });

  it('empty string stays empty', () => {
    expect(normalizeLogGroupName('')).toBe('');
    expect(normalizeLogGroupName('   ')).toBe('');
  });
});

describe('consoleUrlForBuild', () => {
  const build: Build = {
    arn: 'arn:aws:codebuild:eu-north-1:123456789012:build/my-project:abc-def',
    id: 'my-project:abc-def',
    projectName: 'my-project',
  };

  it('returns correct console URL for a valid ARN', () => {
    expect(consoleUrlForBuild(build)).toBe(
      'https://eu-north-1.console.aws.amazon.com/codesuite/codebuild/123456789012/projects/my-project/build/my-project%3Aabc-def?region=eu-north-1',
    );
  });

  it('returns undefined when arn is missing', () => {
    expect(consoleUrlForBuild({ ...build, arn: undefined })).toBeUndefined();
  });

  it('returns undefined when id is missing', () => {
    expect(consoleUrlForBuild({ ...build, id: undefined })).toBeUndefined();
  });

  it('returns undefined when projectName is missing', () => {
    expect(
      consoleUrlForBuild({ ...build, projectName: undefined }),
    ).toBeUndefined();
  });

  it('returns undefined for a malformed ARN', () => {
    expect(
      consoleUrlForBuild({ ...build, arn: 'not-a-codebuild-arn' }),
    ).toBeUndefined();
  });
});
