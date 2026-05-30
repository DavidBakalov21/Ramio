import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssignmentLanguage } from '@prisma/client';
import { CreateAssignmentDto } from './create-assignment.dto';
import { UpdateAssignmentDto } from './update-assignment.dto';

describe('CreateAssignmentDto', () => {
  it('requires title and courseId', async () => {
    const dto = plainToInstance(CreateAssignmentDto, {});
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['title', 'courseId']),
    );
  });

  it('rejects title over 255 chars', async () => {
    const dto = plainToInstance(CreateAssignmentDto, {
      title: 'x'.repeat(256),
      courseId: 1,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('title');
  });

  it('rejects invalid language enum', async () => {
    const dto = plainToInstance(CreateAssignmentDto, {
      title: 'HW',
      courseId: 1,
      language: 'RUST' as AssignmentLanguage,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('language');
  });

  it('accepts valid language enum', async () => {
    const dto = plainToInstance(CreateAssignmentDto, {
      title: 'HW',
      courseId: 1,
      language: AssignmentLanguage.PYTHON,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects description over 2000 chars', async () => {
    const dto = plainToInstance(CreateAssignmentDto, {
      title: 'HW',
      courseId: 1,
      description: 'd'.repeat(2001),
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('description');
  });
});

describe('UpdateAssignmentDto', () => {
  it('allows partial update with valid language', async () => {
    const dto = plainToInstance(UpdateAssignmentDto, {
      language: AssignmentLanguage.JAVA,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
