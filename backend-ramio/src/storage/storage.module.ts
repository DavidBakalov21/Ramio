import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
@Module({
  providers: [
    StorageService,
    {
      provide: 'S3Client',
      useFactory: (configService: ConfigService) => {
        const accessKeyId = configService.get<string>('S3_ACCESS_KEY_ID');
        const secretAccessKey = configService.get<string>('S3_SECRET_ACCESS_KEY');
        const region = configService.get<string>('S3_REGION');

        if (!accessKeyId || !secretAccessKey || !region) {
          throw new Error('S3 configuration is incomplete.');
        }

        // Force regional endpoint to avoid redirects (e.g. from global or wrong endpoint)
        const endpoint = `https://s3.${region}.amazonaws.com`;
        return new S3Client({
          region,
          endpoint,
          forcePathStyle: true, // use https://s3.region.amazonaws.com/bucket/key (some buckets need this)
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
          followRegionRedirects: true,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
