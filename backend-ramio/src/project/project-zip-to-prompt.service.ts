import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const LAMBDA_ARN_KEY = 'PROJECT_ZIP_TO_PROMPT_LAMBDA_ARN';

function regionFromLambdaArn(arn: string): string | undefined {
  const m = /^arn:aws:lambda:([^:]+):/.exec(arn);
  return m?.[1];
}

export interface ProjectZipToPromptResult {
  projectFilesXml: string;
  warnings: string[];
}

@Injectable()
export class ProjectZipToPromptService {
  private readonly logger = new Logger(ProjectZipToPromptService.name);
  private readonly lambdaArn: string | undefined;
  private readonly lambdaClient: LambdaClient | null;

  constructor(private readonly config: ConfigService) {
    this.lambdaArn = this.config.get<string>(LAMBDA_ARN_KEY)?.trim() || undefined;
    const region = this.lambdaArn
      ? regionFromLambdaArn(this.lambdaArn)
      : undefined;
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


  async buildProjectFilesXmlFromS3(
    bucket: string,
    key: string,
  ): Promise<ProjectZipToPromptResult> {
    if (!this.lambdaArn || !this.lambdaClient) {
      throw new ServiceUnavailableException(
        'ZIP parsing runs in AWS Lambda only. Set PROJECT_ZIP_TO_PROMPT_LAMBDA_ARN to the full function ARN, and S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY with lambda:InvokeFunction on that function.',
      );
    }

    try {
      return await this.invokeLambda(bucket, key);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lambda zip parser failed: ${msg}`);
      throw new ServiceUnavailableException(
        `ZIP parser Lambda failed: ${msg}`,
      );
    }
  }

  private async invokeLambda(
    bucket: string,
    key: string,
  ): Promise<ProjectZipToPromptResult> {
    const res = await this.lambdaClient!.send(
      new InvokeCommand({
        FunctionName: this.lambdaArn,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify({ bucket, key })),
      }),
    );

    const raw = res.Payload
      ? Buffer.from(res.Payload).toString('utf8')
      : '';
    if (!raw) {
      throw new Error('Empty Lambda response');
    }

    if (res.FunctionError) {
      let detail = raw;
      try {
        const errBody = JSON.parse(raw) as { errorMessage?: string };
        if (errBody.errorMessage) {
          detail = errBody.errorMessage;
        }
      } catch {
      }
      throw new Error(detail);
    }

    let parsed: {
      ok?: boolean;
      projectFilesXml?: string;
      warnings?: string[];
      error?: string;
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new Error('Lambda returned non-JSON');
    }

    if (!parsed.ok || typeof parsed.projectFilesXml !== 'string') {
      throw new Error(parsed.error || 'Lambda reported failure');
    }

    return {
      projectFilesXml: parsed.projectFilesXml,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  }
}
