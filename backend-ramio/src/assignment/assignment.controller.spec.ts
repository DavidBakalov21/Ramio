import { BadRequestException } from '@nestjs/common';
import { AssignmentLanguage } from '@prisma/client';

jest.mock('./assignment.service', () => ({
  AssignmentService: class AssignmentService {},
}));

import { parseLanguage } from './assignment.controller';

describe('parseLanguage', () => {
  it('"python" → PYTHON (case-insensitive)', () => {
    expect(parseLanguage('python')).toBe(AssignmentLanguage.PYTHON);
    expect(parseLanguage('PYTHON')).toBe(AssignmentLanguage.PYTHON);
  });

  it('unknown language → BadRequestException', () => {
    expect(() => parseLanguage('rust')).toThrow(BadRequestException);
    expect(() => parseLanguage('rust')).toThrow('Invalid language: rust');
  });

  it('undefined → undefined', () => {
    expect(parseLanguage(undefined)).toBeUndefined();
  });
});
