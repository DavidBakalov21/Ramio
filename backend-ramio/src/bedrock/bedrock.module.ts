import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockRuntimeClient,
} from '@aws-sdk/client-bedrock-runtime';
import { BedrockService } from './bedrock.service';

@Module({
  providers: [
    BedrockService,
    {
      provide: 'BedrockRuntimeClient',
      useFactory: (configService: ConfigService) => {
        const region =
          configService.get<string>('BEDROCK_REGION') ?? 'eu-north-1';
        const accessKeyId =
          configService.get<string>('BEDROCK_ACCESS_KEY_ID') ??
          configService.get<string>('BEDROCK_ACCESS_KEY') ??
          configService.get<string>('S3_ACCESS_KEY_ID');
        const secretAccessKey =
          configService.get<string>('BEDROCK_SECRET_ACCESS_KEY') ??
          configService.get<string>('S3_SECRET_ACCESS_KEY');

        if (!accessKeyId || !secretAccessKey) {
          throw new Error(
            'Bedrock configuration is incomplete. Set BEDROCK_ACCESS_KEY and BEDROCK_SECRET_ACCESS_KEY (or BEDROCK_ACCESS_KEY_ID), or S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.',
          );
        }

        return new BedrockRuntimeClient({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [BedrockService],
})
export class BedrockModule {}
