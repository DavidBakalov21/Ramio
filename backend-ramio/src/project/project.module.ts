import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ProjectZipToPromptService } from './project-zip-to-prompt.service';
import { BedrockModule } from '../bedrock/bedrock.module';
import { CodeBuildModule } from '../codebuild/codebuild.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule, BedrockModule, CodeBuildModule],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectZipToPromptService],
  exports: [ProjectService],
})
export class ProjectModule {}
