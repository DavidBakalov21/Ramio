import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';

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

    const gravitonInstance = /^(t4g|m7g|c7g|r7g|g5g)/i.test(
      ec2InstanceTypeId,
    );
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
    } else {
      dbSg.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(3306),
        'MySQL from anywhere (temporary)',
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

    const db = new rds.DatabaseInstance(this, 'Mysql', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_45,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
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
      publiclyAccessible: true,
      multiAz: false,
      autoMinorVersionUpgrade: true,
      backupRetention: cdk.Duration.days(1),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      cloudwatchLogsExports: [],
    });

    db.secret?.grantRead(ec2Role);

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
      description: 'SSM Session Manager recommended; SSH as user `ubuntu` if enabled',
    });
  }
}
