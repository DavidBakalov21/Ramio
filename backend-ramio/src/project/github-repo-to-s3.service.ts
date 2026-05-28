import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const LAMBDA_ARN_KEY = 'GITHUB_REPO_TO_S3_LAMBDA_ARN';

function regionFromLambdaArn(arn: string): string | undefined {
  const m = /^arn:aws:lambda:([^:]+):/.exec(arn);
  return m?.[1];
}

export interface GithubRepoToS3Result {
  key: string;
  url: string;
}

@Injectable()
export class GithubRepoToS3Service {
  private readonly logger = new Logger(GithubRepoToS3Service.name);
  private readonly lambdaArn: string | undefined;
  private readonly lambdaClient: LambdaClient | null;

  constructor(private readonly config: ConfigService) {
    this.lambdaArn = this.config.get<string>(LAMBDA_ARN_KEY)?.trim() || undefined;
    const region = this.lambdaArn ? regionFromLambdaArn(this.lambdaArn) : undefined;

    if (this.lambdaArn && !region) {
      this.logger.error(
        `${LAMBDA_ARN_KEY} must be a full ARN: arn:aws:lambda:REGION:ACCOUNT:function:NAME`,
      );
    }

    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');

    if (this.lambdaArn && region && accessKeyId && secretAccessKey) {
      this.lambdaClient = new LambdaClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.lambdaClient = null;
    }
  }

  async invokeGithubRepoToS3(
    repoUrl: string,
    bucket: string,
    key: string,
    branch?: string,
  ): Promise<GithubRepoToS3Result> {
    if (!this.lambdaArn || !this.lambdaClient) {
      throw new ServiceUnavailableException(
        'GitHub repo submission requires an AWS Lambda function. ' +
        'Deploy lambda/github-repo-to-s3/ and set GITHUB_REPO_TO_S3_LAMBDA_ARN to its full ARN in your .env.',
      );
    }

    try {
      return await this.invokeLambda(repoUrl, bucket, key, branch);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`GitHub repo-to-S3 Lambda failed: ${msg}`);
      throw new ServiceUnavailableException(`GitHub repo-to-S3 Lambda failed: ${msg}`);
    }
  }

  private async invokeLambda(
    repoUrl: string,
    bucket: string,
    key: string,
    branch?: string,
  ): Promise<GithubRepoToS3Result> {
    const payload: Record<string, string> = { repoUrl, bucket, key };
    if (branch) payload.branch = branch;

    const res = await this.lambdaClient!.send(
      new InvokeCommand({
        FunctionName: this.lambdaArn,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(payload)),
      }),
    );

    const raw = res.Payload ? Buffer.from(res.Payload).toString('utf8') : '';
    if (!raw) throw new Error('Empty Lambda response');

    if (res.FunctionError) {
      let detail = raw;
      try {
        const errBody = JSON.parse(raw) as { errorMessage?: string };
        if (errBody.errorMessage) detail = errBody.errorMessage;
      } catch {  }
      throw new Error(detail);
    }

    let parsed: { ok?: boolean; key?: string; url?: string; error?: string };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new Error('Lambda returned non-JSON');
    }

    if (!parsed.ok || typeof parsed.key !== 'string' || typeof parsed.url !== 'string') {
      throw new Error(parsed.error || 'Lambda reported failure');
    }

    return { key: parsed.key, url: parsed.url };
  }
}
