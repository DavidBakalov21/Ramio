import { Module } from '@nestjs/common';
import { CodeTestController } from './code-test.controller';
import { CodeTestService } from './code-test.service';

@Module({
  controllers: [CodeTestController],
  providers: [CodeTestService],
  exports: [CodeTestService],
})
export class CodeTestModule {}
