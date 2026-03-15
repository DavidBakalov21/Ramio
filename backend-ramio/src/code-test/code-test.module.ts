import { Module } from '@nestjs/common';
import { CodeTestController } from './code-test.controller';
import { CodeTestService } from './code-test.service';
import { BedrockModule } from '../bedrock/bedrock.module';

@Module({
  imports: [BedrockModule],
  controllers: [CodeTestController],
  providers: [CodeTestService],
  exports: [CodeTestService],
})
export class CodeTestModule {}
