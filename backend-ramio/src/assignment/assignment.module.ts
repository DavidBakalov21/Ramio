import { Module } from '@nestjs/common';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import { CodeTestModule } from '../code-test/code-test.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule, CodeTestModule],
  controllers: [AssignmentController],
  providers: [AssignmentService],
})
export class AssignmentModule {}
