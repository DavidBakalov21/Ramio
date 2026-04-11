import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectLanguage } from '@prisma/client';
import {
  BatchGetBuildsCommand,
  CodeBuildClient,
  type Build,
  StartBuildCommand,
} from '@aws-sdk/client-codebuild';

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
    const client = this.getClient();
    const out = await client.send(
      new BatchGetBuildsCommand({ ids: [buildId] }),
    );
    return this.mapBuild(out.builds?.[0]);
  }
}
