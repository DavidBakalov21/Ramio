import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface DatabaseProps {
  readonly vpc: ec2.IVpc;
  readonly dbSg: ec2.ISecurityGroup;
  readonly instanceType?: ec2.InstanceType;
}

export class Database extends Construct {
  readonly instance: rds.DatabaseInstance;
  readonly secret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    this.instance = new rds.DatabaseInstance(this, 'Mysql', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_45,
      }),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      instanceType:
        props.instanceType ??
        ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromGeneratedSecret('ramio', {
        secretName: `${stack.stackName}/rds/mysql`,
      }),
      databaseName: 'ramio',
      allocatedStorage: 20,
      maxAllocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      securityGroups: [props.dbSg],
      publiclyAccessible: false,
      multiAz: false,
      autoMinorVersionUpgrade: true,
      backupRetention: cdk.Duration.days(1),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      cloudwatchLogsExports: ['error', 'slowquery'],
    });

    this.secret = this.instance.secret!;
  }

  grantRead(grantee: iam.IGrantable): void {
    this.secret.grantRead(grantee);
  }
}
