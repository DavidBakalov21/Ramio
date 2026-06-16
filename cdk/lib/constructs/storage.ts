import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageProps {
  readonly submissionsBucketName?: string;
  readonly materialsBucketName?: string;
  readonly imagesBucketName?: string;
}

export class Storage extends Construct {
  readonly submissionsBucket: s3.Bucket;
  readonly materialsBucket: s3.Bucket;
  readonly imagesBucket: s3.Bucket;
  readonly filesCdn: cloudfront.Distribution;
  readonly imagesCdn: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StorageProps = {}) {
    super(scope, id);

    this.submissionsBucket = new s3.Bucket(this, 'SubmissionsBucket', {
      bucketName: props.submissionsBucketName ?? 'ramio-file-storage',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      cors: [
        {
          allowedOrigins: ['*'],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.materialsBucket = new s3.Bucket(this, 'MaterialsBucket', {
      bucketName: props.materialsBucketName ?? 'ramio-materials',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      bucketName: props.imagesBucketName ?? 'ramio-images',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.filesCdn = new cloudfront.Distribution(this, 'FilesCdn', {
      comment: 'Ramio file storage CDN',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(
          this.submissionsBucket,
        ),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    this.imagesCdn = new cloudfront.Distribution(this, 'ImagesCdn', {
      comment: 'Ramio images CDN',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(
          this.imagesBucket,
        ),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
  }

  grantReadWrite(grantee: iam.IGrantable): void {
    this.submissionsBucket.grantReadWrite(grantee);
    this.materialsBucket.grantReadWrite(grantee);
    this.imagesBucket.grantReadWrite(grantee);
  }

  grantRead(grantee: iam.IGrantable): void {
    this.submissionsBucket.grantRead(grantee);
    this.materialsBucket.grantRead(grantee);
    this.imagesBucket.grantRead(grantee);
  }
}
