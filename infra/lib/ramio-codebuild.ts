import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import {
  CPP_BUILDSPEC,
  DOTNET_BUILDSPEC,
  JAVA_BUILDSPEC,
  NODE_JS_BUILDSPEC,
  PYTHON_BUILDSPEC,
} from './codebuild-specs';

export type RamioCodeBuildLanguageId =
  | 'Python'
  | 'NodeJs'
  | 'Java'
  | 'DotNet'
  | 'Cpp';

export interface RamioCodeBuildLanguageProject {
  readonly project: codebuild.Project;
  readonly envKey: string;
  readonly projectName: string;
}

export interface RamioCodeBuildProps {
  /** S3 bucket where student submission ZIPs live (e.g. ramio-file-storage). */
  readonly submissionsBucket: s3.IBucket;
  /** IAM roles that may StartBuild and read CloudWatch logs (e.g. EC2 instance role). */
  readonly grantApiAccessTo?: iam.IRole[];
  /**
   * CodeBuild projects to create in this stack. Defaults to Cpp only when the
   * other language projects already exist in the account (console-created).
   */
  readonly provisionLanguages?: RamioCodeBuildLanguageId[];
  /**
   * All Ramio CodeBuild project names (for API IAM). Include console-managed
   * projects here so StartBuild/BatchGetBuilds covers every language.
   */
  readonly allProjectNames?: string[];
}

const LANGUAGE_PROJECTS: {
  id: RamioCodeBuildLanguageId;
  projectName: string;
  envKey: string;
  buildSpec: Record<string, unknown>;
  image?: codebuild.IBuildImage;
}[] = [
  {
    id: 'Python',
    projectName: 'PythonProject',
    envKey: 'CODEBUILD_PROJECT_PYTHON',
    buildSpec: PYTHON_BUILDSPEC,
  },
  {
    id: 'NodeJs',
    projectName: 'NodeJSProject',
    envKey: 'CODEBUILD_PROJECT_NODE_JS',
    buildSpec: NODE_JS_BUILDSPEC,
  },
  {
    id: 'Java',
    projectName: 'JavaProject',
    envKey: 'CODEBUILD_PROJECT_JAVA',
    buildSpec: JAVA_BUILDSPEC,
  },
  {
    id: 'DotNet',
    projectName: 'DotNetProject',
    envKey: 'CODEBUILD_PROJECT_DOTNET',
    buildSpec: DOTNET_BUILDSPEC,
  },
  {
    id: 'Cpp',
    projectName: 'CppProject',
    envKey: 'CODEBUILD_PROJECT_CPP',
    buildSpec: CPP_BUILDSPEC,
  },
];

const DEFAULT_ALL_PROJECT_NAMES = LANGUAGE_PROJECTS.map((p) => p.projectName);

export class RamioCodeBuild extends Construct {
  readonly projects: RamioCodeBuildLanguageProject[];
  readonly apiPolicy: iam.ManagedPolicy;
  readonly allProjectNames: string[];

  constructor(scope: Construct, id: string, props: RamioCodeBuildProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const provisionLanguages = props.provisionLanguages ?? ['Cpp'];
    this.allProjectNames = props.allProjectNames ?? DEFAULT_ALL_PROJECT_NAMES;

    const toProvision = LANGUAGE_PROJECTS.filter((cfg) =>
      provisionLanguages.includes(cfg.id),
    );

    const serviceRole = new iam.Role(this, 'ServiceRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description:
        'Ramio CodeBuild - read submission ZIPs from S3, write logs',
    });
    props.submissionsBucket.grantRead(serviceRole);
    serviceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [
          `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/codebuild/*`,
        ],
      }),
    );

    const buildImage = codebuild.LinuxBuildImage.STANDARD_7_0;
    const environment: codebuild.BuildEnvironment = {
      buildImage,
      computeType: codebuild.ComputeType.SMALL,
      privileged: false,
    };

    this.projects = toProvision.map((cfg) => {
      const project = new codebuild.Project(this, `${cfg.id}Project`, {
        projectName: cfg.projectName,
        description: `Ramio ${cfg.id} project submissions (ZIP from S3 override)`,
        role: serviceRole,
        environment: cfg.image
          ? { ...environment, buildImage: cfg.image }
          : environment,
        buildSpec: codebuild.BuildSpec.fromObject(cfg.buildSpec),
      });

      return {
        project,
        envKey: cfg.envKey,
        projectName: cfg.projectName,
      };
    });

    const allProjectArns = this.allProjectNames.map(
      (name) =>
        `arn:aws:codebuild:${stack.region}:${stack.account}:project/${name}`,
    );

    this.apiPolicy = new iam.ManagedPolicy(this, 'ApiPolicy', {
      managedPolicyName: `${stack.stackName}-codebuild-api`,
      description:
        'Attach to the IAM user/role used by Ramio backend (S3_ACCESS_KEY_ID) for CodeBuild runs',
      statements: [
        new iam.PolicyStatement({
          sid: 'CodeBuildStartAndStatus',
          actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
          resources: [
            ...allProjectArns,
            `arn:aws:codebuild:${stack.region}:${stack.account}:build/*`,
          ],
        }),
        new iam.PolicyStatement({
          sid: 'CodeBuildLogsRead',
          actions: [
            'logs:GetLogEvents',
            'logs:FilterLogEvents',
            'logs:DescribeLogStreams',
          ],
          resources: [
            `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/codebuild/*`,
            `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/codebuild/*:log-stream:*`,
          ],
        }),
      ],
    });

    for (const role of props.grantApiAccessTo ?? []) {
      this.apiPolicy.attachToRole(role);
    }
  }
}
