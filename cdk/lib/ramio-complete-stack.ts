import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { CodeBuild, type LanguageId } from './constructs/codebuild';
import { Compute } from './constructs/compute';
import { RamioCognito } from './constructs/cognito';
import { Database } from './constructs/database';
import { Lambdas } from './constructs/lambdas';
import { Networking } from './constructs/networking';
import { Storage } from './constructs/storage';

export class RamioCompleteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ec2InstanceTypeId =
      (this.node.tryGetContext('ec2InstanceType') as string | undefined) ??
      't4g.nano';
    const sshCidr = this.node.tryGetContext('sshCidr') as string | undefined;
    const dbAccessCidr =
      (this.node.tryGetContext('dbAccessCidr') as string | undefined) ??
      sshCidr;
    const submissionsBucketName =
      (this.node.tryGetContext('submissionsBucketName') as string | undefined) ??
      'ramio-file-storage';
    const materialsBucketName =
      (this.node.tryGetContext('materialsBucketName') as string | undefined) ??
      'ramio-materials';
    const imagesBucketName =
      (this.node.tryGetContext('imagesBucketName') as string | undefined) ??
      'ramio-images';
    const codeBuildLanguages =
      (this.node.tryGetContext('codeBuildProvisionLanguages') as
        | LanguageId[]
        | undefined) ?? ['Python', 'NodeJs', 'Java', 'DotNet', 'Cpp'];
    const apiIamUserName = this.node.tryGetContext('apiIamUserName') as
      | string
      | undefined;
    const frontendUrl =
      (this.node.tryGetContext('frontendUrl') as string | undefined) ??
      'http://localhost:3000';
    const backendCallbackUrl =
      (this.node.tryGetContext('backendCallbackUrl') as string | undefined) ??
      'http://localhost:3333/auth/callback';
    const googleClientId = this.node.tryGetContext('googleClientId') as
      | string
      | undefined;
    const googleClientSecret = this.node.tryGetContext(
      'googleClientSecret',
    ) as string | undefined;
    const bedrockModelId =
      (this.node.tryGetContext('bedrockModelId') as string | undefined) ??
      'anthropic.claude-3-5-sonnet-20241022-v2:0';

    const networking = new Networking(this, 'Networking', {
      sshCidr,
      dbAccessCidr,
    });

    const database = new Database(this, 'Database', {
      vpc: networking.vpc,
      dbSg: networking.dbSg,
    });

    const storage = new Storage(this, 'Storage', {
      submissionsBucketName,
      materialsBucketName,
      imagesBucketName,
    });

    const cognito = new RamioCognito(this, 'Cognito', {
      frontendUrl,
      backendCallbackUrl,
      googleClientId,
      googleClientSecret,
    });

    const lambdas = new Lambdas(this, 'Lambdas', {
      submissionsBucket: storage.submissionsBucket,
    });

    const compute = new Compute(this, 'Compute', {
      vpc: networking.vpc,
      securityGroup: networking.apiSg,
      instanceTypeId: ec2InstanceTypeId,
    });

    const bedrockPolicy = new iam.ManagedPolicy(this, 'BedrockPolicy', {
      managedPolicyName: `${this.stackName}-bedrock-invoke`,
      description: 'Allow Ramio backend to call Bedrock InvokeModel',
      statements: [
        new iam.PolicyStatement({
          sid: 'BedrockInvokeModel',
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
          ],
          resources: [
            `arn:aws:bedrock:${this.region}::foundation-model/*`,
            `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
          ],
        }),
      ],
    });
    bedrockPolicy.attachToRole(compute.role);

    compute.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvokeLambdas',
        actions: ['lambda:InvokeFunction'],
        resources: [
          lambdas.zipToPrompt.functionArn,
          lambdas.githubRepoToS3.functionArn,
        ],
      }),
    );
    storage.grantReadWrite(compute.role);
    database.grantRead(compute.role);

    const apiIamUser = apiIamUserName
      ? iam.User.fromUserName(this, 'ApiIamUser', apiIamUserName)
      : undefined;

    const codeBuild = new CodeBuild(this, 'CodeBuild', {
      submissionsBucket: storage.submissionsBucket,
      provisionLanguages: codeBuildLanguages,
      grantApiAccessTo: [compute.role],
      grantApiAccessToUsers: apiIamUser ? [apiIamUser] : undefined,
    });

    const appConfig = new secretsmanager.Secret(this, 'AppConfig', {
      secretName: `${this.stackName}/app/config`,
      description:
        'Ramio backend: infrastructure values. Add Stripe keys + Cognito secret after deploy.',
      secretObjectValue: {
        PORT: cdk.SecretValue.unsafePlainText('3333'),
        FRONTEND_URL: cdk.SecretValue.unsafePlainText(frontendUrl),
        FRONTEND_BASE_URL: cdk.SecretValue.unsafePlainText(frontendUrl),
        ORIGINS: cdk.SecretValue.unsafePlainText(frontendUrl),
        BACKEND_CALLBACK_URL: cdk.SecretValue.unsafePlainText(backendCallbackUrl),

        COGNITO_REGION: cdk.SecretValue.unsafePlainText(this.region),
        COGNITO_USER_POOL_ID: cdk.SecretValue.unsafePlainText(
          cognito.userPool.userPoolId,
        ),
        COGNITO_CLIENT_ID: cdk.SecretValue.unsafePlainText(
          cognito.userPoolClient.userPoolClientId,
        ),
        COGNITO_DOMAIN: cdk.SecretValue.unsafePlainText(
          `https://ramio-auth.auth.${this.region}.amazoncognito.com`,
        ),

        S3_REGION: cdk.SecretValue.unsafePlainText(this.region),
        S3_BUCKET: cdk.SecretValue.unsafePlainText(
          storage.submissionsBucket.bucketName,
        ),
        S3_BUCKET_ASSIGNMENTS: cdk.SecretValue.unsafePlainText(
          storage.submissionsBucket.bucketName,
        ),
        S3_BUCKET_MATERIALS: cdk.SecretValue.unsafePlainText(
          storage.materialsBucket.bucketName,
        ),
        S3_BUCKET_BACKGROUND: cdk.SecretValue.unsafePlainText(
          storage.imagesBucket.bucketName,
        ),

        BEDROCK_REGION: cdk.SecretValue.unsafePlainText(this.region),
        BEDROCK_MODEL_ID: cdk.SecretValue.unsafePlainText(bedrockModelId),

        PROJECT_ZIP_TO_PROMPT_LAMBDA_ARN: cdk.SecretValue.unsafePlainText(
          lambdas.zipToPrompt.functionArn,
        ),
        GITHUB_REPO_TO_S3_LAMBDA_ARN: cdk.SecretValue.unsafePlainText(
          lambdas.githubRepoToS3.functionArn,
        ),

        CODEBUILD_REGION: cdk.SecretValue.unsafePlainText(this.region),
        CODEBUILD_PROJECT_Python: cdk.SecretValue.unsafePlainText('PythonProject'),
        CODEBUILD_PROJECT_NODE_JS: cdk.SecretValue.unsafePlainText('NodeJSProject'),
        CODEBUILD_PROJECT_JAVA: cdk.SecretValue.unsafePlainText('JavaProject'),
        CODEBUILD_PROJECT_DOTNET: cdk.SecretValue.unsafePlainText('DotNetProject'),
        CODEBUILD_PROJECT_CPP: cdk.SecretValue.unsafePlainText('CppProject'),
        COGNITO_CLIENT_SECRET: cdk.SecretValue.unsafePlainText('REPLACE_AFTER_DEPLOY'),
        S3_ACCESS_KEY_ID: cdk.SecretValue.unsafePlainText('REPLACE_WITH_IAM_KEY'),
        S3_SECRET_ACCESS_KEY: cdk.SecretValue.unsafePlainText('REPLACE_WITH_IAM_SECRET'),
        STRIPE_SECRET_KEY: cdk.SecretValue.unsafePlainText('REPLACE_WITH_STRIPE_KEY'),
        STRIPE_WEBHOOK_SECRET: cdk.SecretValue.unsafePlainText('REPLACE_WITH_STRIPE_WEBHOOK_SECRET'),
        STRIPE_SUPPORT_PRICE_ID: cdk.SecretValue.unsafePlainText('REPLACE_WITH_PRICE_ID'),
        STRIPE_PRO_PRICE_ID: cdk.SecretValue.unsafePlainText('REPLACE_WITH_PRICE_ID'),
        STRIPE_PREMIUM_PRICE_ID: cdk.SecretValue.unsafePlainText('REPLACE_WITH_PRICE_ID'),
      },
    });
    appConfig.grantRead(compute.role);

    new cdk.CfnOutput(this, 'VpcId', { value: networking.vpc.vpcId });

    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: database.instance.instanceEndpoint.hostname,
      description: 'RDS MySQL host (port 3306, private subnet)',
    });
    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: database.secret.secretArn,
      description: 'Secrets Manager: RDS username + password',
    });

    new cdk.CfnOutput(this, 'Ec2InstanceId', {
      value: compute.instance.instanceId,
    });
    new cdk.CfnOutput(this, 'Ec2ElasticIp', {
      value: compute.elasticIp.ref,
      description: 'Static public IP — point your DNS here',
    });

    new cdk.CfnOutput(this, 'SubmissionsBucket', {
      value: storage.submissionsBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'MaterialsBucket', {
      value: storage.materialsBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'ImagesBucket', {
      value: storage.imagesBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'FilesCdnDomain', {
      value: storage.filesCdn.distributionDomainName,
      description: 'CloudFront domain for file/submission downloads',
    });
    new cdk.CfnOutput(this, 'ImagesCdnDomain', {
      value: storage.imagesCdn.distributionDomainName,
      description: 'CloudFront domain for user/course images',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: cognito.userPool.userPoolId,
      description: 'Set COGNITO_USER_POOL_ID in backend .env',
    });
    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: cognito.userPoolClient.userPoolClientId,
      description: 'Set COGNITO_CLIENT_ID in backend .env',
    });
    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `https://ramio-auth.auth.${this.region}.amazoncognito.com`,
      description: 'Set COGNITO_DOMAIN in backend .env',
    });

    new cdk.CfnOutput(this, 'ZipToPromptArn', {
      value: lambdas.zipToPrompt.functionArn,
      description: 'Set PROJECT_ZIP_TO_PROMPT_LAMBDA_ARN in backend .env',
    });
    new cdk.CfnOutput(this, 'GithubRepoToS3Arn', {
      value: lambdas.githubRepoToS3.functionArn,
      description: 'Set GITHUB_REPO_TO_S3_LAMBDA_ARN in backend .env',
    });

    new cdk.CfnOutput(this, 'AppConfigSecretArn', {
      value: appConfig.secretArn,
      description: 'Secrets Manager ARN containing all app config values',
    });
    new cdk.CfnOutput(this, 'CodeBuildApiPolicyArn', {
      value: codeBuild.apiPolicy.managedPolicyArn,
      description: 'Attach to any IAM identity that needs CodeBuild access',
    });
    for (const p of codeBuild.projects) {
      new cdk.CfnOutput(this, `CodeBuild${p.projectName}`, {
        value: p.projectName,
        description: `Set ${p.envKey} in backend .env`,
      });
    }
  }
}
