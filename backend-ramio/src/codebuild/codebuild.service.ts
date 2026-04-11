import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectLanguage } from '@prisma/client';
import {
  BatchGetBuildsCommand,
  CodeBuildClient,
  type Build,
  StartBuildCommand,
} from '@aws-sdk/client-codebuild';
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  GetLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { parseTestCountsFromBuildLog } from './codebuild-log-parser';

const CODEBUILD_PROJECT_ENV_BY_LANGUAGE: Record<ProjectLanguage, string> = {
  DOTNET: 'CODEBUILD_PROJECT_DOTNET',
  PYTHON: 'CODEBUILD_PROJECT_PYTHON',
  JAVA: 'CODEBUILD_PROJECT_JAVA',
  NODE_JS: 'CODEBUILD_PROJECT_NODE_JS',
};

/** Used when no CODEBUILD_PROJECT_* or CODEBUILD_PROJECT_NAME is set (IAM must allow StartBuild on this project). */
const DEFAULT_CODEBUILD_PROJECT_BY_LANGUAGE: Partial<
  Record<ProjectLanguage, string>
> = {
  PYTHON: 'PythonProject',
  NODE_JS: 'NodeJSProject',
  JAVA: 'JavaProject',
};

export interface CodeBuildStartResult {
  buildId: string;
  status: string;
  phase?: string;
  logsUrl?: string;
}

export interface CodeBuildStatusResult {
  buildId: string;
  status: string;
  phase?: string;
  logsUrl?: string;
}

export interface CodeBuildTestMetrics {
  passed: number;
  failed: number;
  skipped: number;
}

const TERMINAL_CODEBUILD_STATUSES = new Set([
  'SUCCEEDED',
  'FAILED',
  'FAULT',
  'TIMED_OUT',
  'STOPPED',
]);

export function isTerminalCodeBuildStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return TERMINAL_CODEBUILD_STATUSES.has(status);
}

/** CodeBuild sometimes omits the leading slash; CloudWatch expects the canonical name. */
function normalizeLogGroupName(name: string): string {
  const t = name.trim();
  if (!t) return t;
  return t.startsWith('/') ? t : `/${t}`;
}

function consoleUrlForBuild(build: Build): string | undefined {
  const arn = build.arn;
  const id = build.id;
  const projectName = build.projectName;
  if (!arn || !id || !projectName) return undefined;
  const m = /^arn:aws:codebuild:([^:]+):(\d+):build\//.exec(arn);
  if (!m) return undefined;
  const [, region, account] = m;
  return `https://${region}.console.aws.amazon.com/codesuite/codebuild/${account}/projects/${encodeURIComponent(projectName)}/build/${encodeURIComponent(id)}?region=${region}`;
}

@Injectable()
export class CodeBuildService {
  private client: CodeBuildClient | null = null;
  private logsClient: CloudWatchLogsClient | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): CodeBuildClient {
    if (this.client) return this.client;
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    const region =
      this.config.get<string>('CODEBUILD_REGION')?.trim() ||
      this.config.get<string>('S3_REGION')?.trim() ||
      'eu-north-1';
    if (!accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException(
        'CodeBuild requires S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (with codebuild:StartBuild and codebuild:BatchGetBuilds).',
      );
    }
    this.client = new CodeBuildClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }

  private getLogsClient(): CloudWatchLogsClient {
    if (this.logsClient) return this.logsClient;
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    const region =
      this.config.get<string>('CODEBUILD_REGION')?.trim() ||
      this.config.get<string>('S3_REGION')?.trim() ||
      'eu-north-1';
    if (!accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException(
        'CloudWatch Logs requires S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (with logs:GetLogEvents and logs:FilterLogEvents on CodeBuild log groups).',
      );
    }
    this.logsClient = new CloudWatchLogsClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.logsClient;
  }

  resolveCodeBuildProjectName(language: ProjectLanguage): string {
    const envKey = CODEBUILD_PROJECT_ENV_BY_LANGUAGE[language];
    const specific =
      this.config.get<string>(envKey)?.trim() ??
      (language === 'NODE_JS'
        ? this.config.get<string>('CODEBUILD_PROJECT_NODEJS')?.trim()
        : undefined);
    if (specific) return specific;
    const legacy = this.config.get<string>('CODEBUILD_PROJECT_NAME')?.trim();
    if (legacy) return legacy;
    const defaultName = DEFAULT_CODEBUILD_PROJECT_BY_LANGUAGE[language];
    if (defaultName) return defaultName;
    throw new ServiceUnavailableException(
      `Set ${envKey} (or legacy CODEBUILD_PROJECT_NAME) for ${language} CodeBuild runs.`,
    );
  }

  private mapBuild(build: Build | undefined): CodeBuildStatusResult | null {
    if (!build?.id) return null;
    const logsUrl = consoleUrlForBuild(build);
    return {
      buildId: build.id,
      status: build.buildStatus ?? 'UNKNOWN',
      phase: build.currentPhase,
      logsUrl,
    };
  }

  async startBuildWithS3ZipSource(
    bucket: string,
    objectKey: string,
    language: ProjectLanguage,
  ): Promise<CodeBuildStartResult> {
    const projectName = this.resolveCodeBuildProjectName(language);
    const client = this.getClient();
    const sourceLocationOverride = `${bucket}/${objectKey.replace(/^\/+/, '')}`;

    const out = await client.send(
      new StartBuildCommand({
        projectName,
        sourceTypeOverride: 'S3',
        sourceLocationOverride,
      }),
    );

    const mapped = this.mapBuild(out.build);
    if (!mapped) {
      throw new ServiceUnavailableException(
        'CodeBuild did not return a build id. Check CODEBUILD_PROJECT_* env vars and IAM permissions.',
      );
    }

    return {
      buildId: mapped.buildId,
      status: mapped.status,
      phase: mapped.phase,
      logsUrl: mapped.logsUrl,
    };
  }

  async getBuildStatus(buildId: string): Promise<CodeBuildStatusResult | null> {
    const build = await this.getBuildRecord(buildId);
    return this.mapBuild(build);
  }

  async getBuildRecord(buildId: string): Promise<Build | undefined> {
    const client = this.getClient();
    const out = await client.send(
      new BatchGetBuildsCommand({ ids: [buildId] }),
    );
    return out.builds?.[0];
  }

  /**
   * Fetches the tail of the CodeBuild log stream (test summaries are usually at the end).
   * Paginates with nextBackwardToken; empty pages can occur when startFromHead is false.
   */
  private async fetchBuildLinesMatching(
    groupName: string,
    streamName: string,
    filterPattern: string,
    maxEvents = 80,
  ): Promise<string | null> {
    const logs = this.getLogsClient();
    const g = normalizeLogGroupName(groupName);
    try {
      const out = await logs.send(
        new FilterLogEventsCommand({
          logGroupName: g,
          logStreamNames: [streamName],
          filterPattern,
          limit: maxEvents,
        }),
      );
      const msgs = (out.events ?? []).map((e) => e.message ?? '');
      return msgs.length ? msgs.join('') : null;
    } catch {
      return null;
    }
  }

  private async fetchBuildLogTailText(
    groupName: string,
    streamName: string,
    maxChars = 1_000_000,
  ): Promise<string | null> {
    const logs = this.getLogsClient();
    const g = normalizeLogGroupName(groupName);
    const parts: string[] = [];
    let totalLen = 0;
    let requestToken: string | undefined;
    for (let page = 0; page < 60; page++) {
      const out = await logs.send(
        new GetLogEventsCommand({
          logGroupName: g,
          logStreamName: streamName,
          startFromHead: false,
          limit: 10000,
          nextToken: requestToken,
        }),
      );
      const backward = out.nextBackwardToken;
      if (backward && requestToken === backward) break;
      const evs = out.events ?? [];
      for (const e of evs) {
        if (e.message) {
          parts.push(e.message);
          totalLen += e.message.length;
        }
      }
      if (totalLen >= maxChars) break;
      if (!backward) break;
      requestToken = backward;
    }
    return parts.length ? parts.join('') : null;
  }

  getConsoleUrlForBuild(build: Build): string | undefined {
    return consoleUrlForBuild(build);
  }

  async tryExtractTestMetricsFromBuild(
    build: Build,
  ): Promise<CodeBuildTestMetrics | null> {
    const status = build.buildStatus ?? '';
    if (!isTerminalCodeBuildStatus(status)) return null;
    const groupName = build.logs?.groupName;
    const streamName = build.logs?.streamName;
    if (!groupName || !streamName) return null;
    try {
      let text = await this.fetchBuildLogTailText(groupName, streamName);
      let parsed = text ? parseTestCountsFromBuildLog(text) : null;
      if (parsed) return parsed;

      const snippets = [
        await this.fetchBuildLinesMatching(groupName, streamName, 'passed', 80),
        await this.fetchBuildLinesMatching(groupName, streamName, 'failed', 80),
        await this.fetchBuildLinesMatching(groupName, streamName, 'Tests:', 80),
        await this.fetchBuildLinesMatching(groupName, streamName, 'test session', 80),
      ].filter(Boolean) as string[];
      const merged = snippets.length ? snippets.join('\n') : null;
      if (merged) {
        parsed = parseTestCountsFromBuildLog(merged);
        if (parsed) return parsed;
        if (text) parsed = parseTestCountsFromBuildLog(`${text}\n${merged}`);
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
