import { Module } from '@nestjs/common';
import { CodeTestController } from './code-test.controller';
import { CodeTestService } from './code-test.service';

@Module({
  controllers: [CodeTestController],
  providers: [CodeTestService]
})
export class CodeTestModule {}
