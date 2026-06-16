#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { RamioCompleteStack } from '../lib/ramio-complete-stack';

const app = new cdk.App();

new RamioCompleteStack(app, 'RamioComplete', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-north-1',
  },
  description:
    'Ramio — complete infrastructure: VPC, RDS, EC2, S3, CloudFront, Cognito, Lambda (ZipToPrompt + GithubRepoToS3), CodeBuild (5 languages)',
});

app.synth();
