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
} from '../codebuild-specs';

export type LanguageId = 'Python' | 'NodeJs' | 'Java' | 'DotNet' | 'Cpp';

export interface LanguageProject {
  readonly project: codebuild.Project;
  readonly envKey: string;
  readonly projectName: string;
}

export interface CodeBuildProps {
  readonly submissionsBucket: s3.IBucket;
  readonly provisionLanguages?: LanguageId[];
  readonly grantApiAccessTo?: iam.IRole[];
  readonly grantApiAccessToUsers?: iam.IUser[];
}

const LANGUAGE_CONFIGS: {
  id: LanguageId;
  projectName: string;
  envKey: string;
  buildSpec: Record<string, unknown>;
}[] = [
  {
    id: 'Python',
    projectName: 'PythonProject',
    envKey: 'CODEBUILD_PROJECT_Python',
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

const ALL_PROJECT_NAMES = LANGUAGE_CONFIGS.map((c) => c.projectName);

export class CodeBuild extends Construct {
  readonly projects: LanguageProject[];
  readonly apiPolicy: iam.ManagedPolicy;

  constructor(scope: Construct, id: string, props: CodeBuildProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const provisionLanguages =
      props.provisionLanguages ?? ['Python', 'NodeJs', 'Java', 'DotNet', 'Cpp'];
    const toProvision = LANGUAGE_CONFIGS.filter((c) =>
      provisionLanguages.includes(c.id),
    );

    const serviceRole = new iam.Role(this, 'ServiceRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'Ramio CodeBuild — read submission ZIPs from S3, write CW logs',
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

    this.projects = toProvision.map((cfg) => {
      const project = new codebuild.Project(this, `${cfg.id}Project`, {
        projectName: cfg.projectName,
        description: `Ramio ${cfg.id} submission runner`,
        role: serviceRole,
        environment: {
          buildImage,
          computeType: codebuild.ComputeType.SMALL,
          privileged: false,
        },
        buildSpec: codebuild.BuildSpec.fromObject(cfg.buildSpec),
      });
      return { project, envKey: cfg.envKey, projectName: cfg.projectName };
    });

    const allProjectArns = ALL_PROJECT_NAMES.map(
      (name) =>
        `arn:aws:codebuild:${stack.region}:${stack.account}:project/${name}`,
    );

    this.apiPolicy = new iam.ManagedPolicy(this, 'ApiPolicy', {
      managedPolicyName: `${stack.stackName}-codebuild-api`,
      description: 'Attach to Ramio backend IAM identity for CodeBuild access',
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
    for (const user of props.grantApiAccessToUsers ?? []) {
      this.apiPolicy.attachToUser(user);
    }
  }
}
