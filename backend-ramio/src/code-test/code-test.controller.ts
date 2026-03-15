import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CodeTestService } from './code-test.service';
import { RunCodeDto } from './dto/run-code.dto';
import {
  GenerateTestsDto,
  GenerateTestsResponseDto,
} from './dto/generate-tests.dto';
import {
  GenerateTestsFromDescriptionDto,
  GenerateTestsFromDescriptionResponseDto,
} from './dto/generate-tests-from-description.dto';

@Controller('code-test')
export class CodeTestController {
  constructor(private readonly codeTestService: CodeTestService) {}

  @Post('python/run')
  async run(@Body() dto: RunCodeDto) {
    return this.codeTestService.runPythonTests(dto.code, dto.tests);
  }

  @Post('generate-tests')
  async generateTests(
    @Body() dto: GenerateTestsDto,
  ): Promise<GenerateTestsResponseDto> {
    const tests = await this.codeTestService.generateUnitTests(
      dto.code,
      dto.language ?? 'python',
    );
    return { tests };
  }

  @Post('generate-tests-from-description')
  @Roles(UserRole.TEACHER)
  async generateTestsFromDescription(
    @Body() dto: GenerateTestsFromDescriptionDto,
  ): Promise<GenerateTestsFromDescriptionResponseDto> {
    const tests = await this.codeTestService.generateUnitTestsFromDescription(
      dto.description,
      dto.language ?? 'python',
    );
    return { tests };
  }
}
