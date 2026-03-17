import { Module } from '@nestjs/common';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import { CodeTestModule } from '../code-test/code-test.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { BedrockModule } from '../bedrock/bedrock.module';

@Module({
  imports: [PrismaModule, StorageModule, CodeTestModule, BedrockModule],
  controllers: [AssignmentController],
  providers: [AssignmentService],
})
export class AssignmentModule {}
