import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { BedrockModule } from '../bedrock/bedrock.module';
import { CodeTestModule } from '../code-test/code-test.module';

@Module({
  imports: [PrismaModule, StorageModule, BedrockModule, CodeTestModule],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService],
})
export class QuizModule {}
