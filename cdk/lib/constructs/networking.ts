import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkingProps {
  readonly sshCidr?: string;
  readonly dbAccessCidr?: string;
}

export class Networking extends Construct {
  readonly vpc: ec2.Vpc;
  readonly apiSg: ec2.SecurityGroup;
  readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkingProps = {}) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
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

    this.dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: this.vpc,
      description: 'MySQL - only from app EC2',
      allowAllOutbound: false,
    });

    this.apiSg = new ec2.SecurityGroup(this, 'ApiSg', {
      vpc: this.vpc,
      description: 'Ramio API + frontend',
      allowAllOutbound: true,
    });

    this.dbSg.addIngressRule(this.apiSg, ec2.Port.tcp(3306), 'MySQL from EC2');

    const effectiveDbCidr = props.dbAccessCidr ?? props.sshCidr;
    if (effectiveDbCidr) {
      this.dbSg.addIngressRule(
        ec2.Peer.ipv4(effectiveDbCidr),
        ec2.Port.tcp(3306),
        'MySQL from developer CIDR',
      );
    }

    this.apiSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    this.apiSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    this.apiSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      'Frontend (nginx port)',
    );
    this.apiSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3333),
      'NestJS API (tighten behind ALB later)',
    );
    if (props.sshCidr) {
      this.apiSg.addIngressRule(
        ec2.Peer.ipv4(props.sshCidr),
        ec2.Port.tcp(22),
        'SSH from context sshCidr',
      );
    }
  }
}
