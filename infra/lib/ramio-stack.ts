import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {
  RamioCodeBuild,
  type RamioCodeBuildLanguageId,
} from './ramio-codebuild';

export class RamioStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ec2InstanceTypeId =
      (this.node.tryGetContext('ec2InstanceType') as string | undefined) ??
      't4g.nano';
    const sshCidr = this.node.tryGetContext('sshCidr') as string | undefined;
    const dbAccessCidr =
      (this.node.tryGetContext('dbAccessCidr') as string | undefined) ??
      sshCidr;

    const gravitonInstance = /^(t4g|m7g|c7g|r7g|g5g)/i.test(ec2InstanceTypeId);
    const ubuntuSsmParameter = gravitonInstance
      ? '/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id'
      : '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id';

    const machineImage = ec2.MachineImage.fromSsmParameter(ubuntuSsmParameter, {
      os: ec2.OperatingSystemType.LINUX,
      cachedInContext: true,
    });

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'MySQL - only from app EC2',
      allowAllOutbound: false,
    });

    const apiSg = new ec2.SecurityGroup(this, 'ApiSg', {
      vpc,
      description: 'Ramio API',
      allowAllOutbound: true,
    });

    dbSg.addIngressRule(apiSg, ec2.Port.tcp(3306), 'MySQL from app instance');
    if (dbAccessCidr) {
      dbSg.addIngressRule(
        ec2.Peer.ipv4(dbAccessCidr),
        ec2.Port.tcp(3306),
        'MySQL from developer machine CIDR',
      );
    }

    apiSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      'HTTP API (tighten later)',
    );
    if (sshCidr) {
      apiSg.addIngressRule(
        ec2.Peer.ipv4(sshCidr),
        ec2.Port.tcp(22),
        'SSH (from context sshCidr)',
      );
    }

    const ec2Role = new iam.Role(this, 'Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'Ramio EC2 - SSM + read RDS master secret',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore',
        ),
      ],
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -euxo pipefail',
      'export DEBIAN_FRONTEND=noninteractive',
      'apt-get update -y',
      'apt-get install -y docker.io git',
      'systemctl enable docker',
      'systemctl start docker',
      'usermod -aG docker ubuntu || true',
    );

    const instance = new ec2.Instance(this, 'AppInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(ec2InstanceTypeId),
      machineImage,
      securityGroup: apiSg,
      role: ec2Role,
      associatePublicIpAddress: true,
      userData,
      detailedMonitoring: false,
    });

    const appElasticIp = new ec2.CfnEIP(this, 'AppElasticIp', {
      domain: 'vpc',
    });

    new ec2.CfnEIPAssociation(this, 'AppElasticIpAssociation', {
      allocationId: appElasticIp.attrAllocationId,
      instanceId: instance.instanceId,
    });

    const db = new rds.DatabaseInstance(this, 'Mysql', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_45,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      credentials: rds.Credentials.fromGeneratedSecret('ramio', {
        secretName: `${this.stackName}/rds/mysql`,
      }),
      databaseName: 'ramio',
      allocatedStorage: 20,
      maxAllocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      securityGroups: [dbSg],
      publiclyAccessible: false,
      multiAz: false,
      autoMinorVersionUpgrade: true,
      backupRetention: cdk.Duration.days(1),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      cloudwatchLogsExports: [],
    });

    db.secret?.grantRead(ec2Role);

    const submissionsBucketName =
      (this.node.tryGetContext('submissionsBucketName') as string | undefined) ??
      'ramio-file-storage';
    const submissionsBucket = s3.Bucket.fromBucketName(
      this,
      'SubmissionsBucket',
      submissionsBucketName,
    );

    const codeBuildProvisionLanguages =
      (this.node.tryGetContext('codeBuildProvisionLanguages') as
        | RamioCodeBuildLanguageId[]
        | undefined) ?? ['Cpp'];

    const apiIamUserName = this.node.tryGetContext('apiIamUserName') as
      | string
      | undefined;
    const apiIamUser = apiIamUserName
      ? iam.User.fromUserName(this, 'ApiIamUser', apiIamUserName)
      : undefined;

    const codeBuild = new RamioCodeBuild(this, 'CodeBuild', {
      submissionsBucket,
      grantApiAccessTo: [ec2Role],
      grantApiAccessToUsers: apiIamUser ? [apiIamUser] : undefined,
      provisionLanguages: codeBuildProvisionLanguages,
    });

    new cdk.CfnOutput(this, 'VpcId', { value: vpc.vpcId });
    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: db.instanceEndpoint.hostname,
      description: 'MySQL host (port 3306)',
    });
    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: db.secret?.secretArn ?? '',
      description: 'Secrets Manager JSON: username + password',
    });
    new cdk.CfnOutput(this, 'Ec2InstanceId', { value: instance.instanceId });
    new cdk.CfnOutput(this, 'Ec2PublicIp', {
      value: instance.instancePublicIp,
      description:
        'Instance public IP attribute (may be empty when using Elastic IP)',
    });
    new cdk.CfnOutput(this, 'Ec2ElasticIp', {
      value: appElasticIp.ref,
      description: 'Static public IP for EC2 instance',
    });

    new cdk.CfnOutput(this, 'SubmissionsBucketName', {
      value: submissionsBucketName,
      description: 'S3 bucket for project/assignment ZIP submissions',
    });

    new cdk.CfnOutput(this, 'CodeBuildApiPolicyArn', {
      value: codeBuild.apiPolicy.managedPolicyArn,
      description: 'CodeBuild API policy (auto-attached when apiIamUserName is set)',
    });

    if (apiIamUserName) {
      new cdk.CfnOutput(this, 'CodeBuildApiIamUser', {
        value: apiIamUserName,
        description: 'IAM user granted RamioStack-codebuild-api via CDK',
      });
    }

    new cdk.CfnOutput(this, 'CodeBuildProvisionedProjects', {
      value: codeBuild.projects.map((p) => p.projectName).join(', ') || '(none)',
      description: 'CodeBuild projects created or updated by this deploy',
    });

    for (const lang of codeBuild.projects) {
      new cdk.CfnOutput(this, `CodeBuild${lang.projectName}`, {
        value: lang.projectName,
        description: `Set ${lang.envKey} in backend .env (default name matches)`,
      });
    }

    new cdk.CfnOutput(this, 'CodeBuildRegion', {
      value: this.region,
      description: 'Set CODEBUILD_REGION in backend .env',
    });
  }
}
