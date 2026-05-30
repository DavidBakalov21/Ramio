import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerateTestsFromDescriptionDto } from './generate-tests-from-description.dto';
import { GenerateTestsDto } from './generate-tests.dto';
import { RunCodeDto } from './run-code.dto';

describe('RunCodeDto', () => {
  it('requires code and tests', async () => {
    const dto = plainToInstance(RunCodeDto, {});
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['code', 'tests']),
    );
  });

  it('rejects code over 100000 chars', async () => {
    const dto = plainToInstance(RunCodeDto, {
      code: 'x'.repeat(100_001),
      tests: 'ok',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('code');
  });
});

describe('GenerateTestsDto', () => {
  it('requires code', async () => {
    const dto = plainToInstance(GenerateTestsDto, {});
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('code');
  });

  it('allows only known languages', async () => {
    const dto = plainToInstance(GenerateTestsDto, {
      code: 'print(1)',
      language: 'go',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('language');
  });

  it('accepts python language', async () => {
    const dto = plainToInstance(GenerateTestsDto, {
      code: 'print(1)',
      language: 'python',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('GenerateTestsFromDescriptionDto', () => {
  it('requires description', async () => {
    const dto = plainToInstance(GenerateTestsFromDescriptionDto, {});
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('description');
  });

  it('rejects description over 10000 chars', async () => {
    const dto = plainToInstance(GenerateTestsFromDescriptionDto, {
      description: 'd'.repeat(10_001),
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('description');
  });
});
