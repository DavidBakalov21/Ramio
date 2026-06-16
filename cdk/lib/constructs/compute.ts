import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface ComputeProps {
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly instanceTypeId?: string;
}

export class Compute extends Construct {
  readonly instance: ec2.Instance;
  readonly elasticIp: ec2.CfnEIP;
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: ComputeProps) {
    super(scope, id);

    const instanceTypeId = props.instanceTypeId ?? 't4g.nano';
    const isGraviton = /^(t4g|m7g|c7g|r7g|g5g)/i.test(instanceTypeId);

    const ssmParam = isGraviton
      ? '/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id'
      : '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id';

    const machineImage = ec2.MachineImage.fromSsmParameter(ssmParam, {
      os: ec2.OperatingSystemType.LINUX,
      cachedInContext: true,
    });

    this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description:
        'Ramio EC2 — SSM access + runtime AWS permissions granted by other constructs',
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

    this.instance = new ec2.Instance(this, 'Instance', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(instanceTypeId),
      machineImage,
      securityGroup: props.securityGroup,
      role: this.role,
      associatePublicIpAddress: true,
      userData,
      detailedMonitoring: false,
    });

    this.elasticIp = new ec2.CfnEIP(this, 'ElasticIp', { domain: 'vpc' });
    new ec2.CfnEIPAssociation(this, 'ElasticIpAssociation', {
      allocationId: this.elasticIp.attrAllocationId,
      instanceId: this.instance.instanceId,
    });
  }
}
