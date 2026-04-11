import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CodeBuildService } from './codebuild.service';

@Module({
  imports: [ConfigModule],
  providers: [CodeBuildService],
  exports: [CodeBuildService],
})
export class CodeBuildModule {}
