import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface LambdasProps {
  readonly submissionsBucket: s3.IBucket;
}

const LAMBDA_DIR = path.join(__dirname, '../../../lambda');

export class Lambdas extends Construct {
  readonly zipToPrompt: lambda.Function;
  readonly githubRepoToS3: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdasProps) {
    super(scope, id);


    const zipToPromptRole = new iam.Role(this, 'ZipToPromptRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'ZipToPrompt Lambda execution role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });
    props.submissionsBucket.grantRead(zipToPromptRole);

    const zipToPromptSrc = path.join(LAMBDA_DIR, 'project-zip-to-prompt');

    this.zipToPrompt = new lambda.Function(this, 'ZipToPrompt', {
      functionName: 'ZipToPrompt',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(zipToPromptSrc, {
        bundling: {
          image: lambda.Runtime.NODEJS_22_X.bundlingImage,
          command: [
            'bash',
            '-c',
            [
              'cp -r /asset-input/. /asset-output/',
              'cd /asset-output',
              'npm install --omit=dev --no-audit --prefer-offline',
            ].join(' && '),
          ],
          local: {
            tryBundle(outputDir: string): boolean {
              try {
                spawnSync('cp', ['-r', `${zipToPromptSrc}/.`, outputDir], {
                  stdio: 'inherit',
                  shell: false,
                });
                const result = spawnSync(
                  'npm',
                  ['install', '--omit=dev', '--no-audit'],
                  { cwd: outputDir, stdio: 'inherit', shell: false },
                );
                return result.status === 0;
              } catch {
                return false;
              }
            },
          },
        },
      }),
      role: zipToPromptRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      description:
        'Downloads S3 zip, extracts text from source/doc files, returns XML for Bedrock prompts',
    });

    const githubToS3Role = new iam.Role(this, 'GithubRepoToS3Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'GithubRepoToS3 Lambda execution role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });
    props.submissionsBucket.grantPut(githubToS3Role);

    this.githubRepoToS3 = new lambda.DockerImageFunction(
      this,
      'GithubRepoToS3',
      {
        functionName: 'GithubRepoToS3',
        code: lambda.DockerImageCode.fromImageAsset(
          path.join(LAMBDA_DIR, 'github-repo-to-s3'),
        ),
        role: githubToS3Role,
        timeout: cdk.Duration.seconds(180),
        memorySize: 1024,
        description:
          'Clones a public GitHub repo, zips the contents, uploads to S3',
      },
    );
  }
}
