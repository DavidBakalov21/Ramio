import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { CodeTestService } from './code-test.service';
import { RunCodeDto } from './dto/run-code.dto';

@Controller('code-test')
export class CodeTestController {
  constructor(private readonly codeTestService: CodeTestService) {}

  @Post('python/run')
  async run(@Body() dto: RunCodeDto) {
    return this.codeTestService.runPythonTests(dto.code, dto.tests);
  }
}
