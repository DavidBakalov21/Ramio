#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { RamioStack } from '../lib/ramio-stack';

const app = new cdk.App();

new RamioStack(app, 'RamioStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-north-1',
  },
  description: 'Ramio cheap VPC + MySQL (RDS) + EC2',
});

app.synth();
