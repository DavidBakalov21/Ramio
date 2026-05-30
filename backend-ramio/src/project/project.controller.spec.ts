import { BadRequestException } from '@nestjs/common';

jest.mock('./project.service', () => ({
  ProjectService: class ProjectService {},
}));

import { parseOptionalId } from './project.controller';

describe('parseOptionalId', () => {
  it('"42" → 42n', () => {
    expect(parseOptionalId('42')).toBe(42n);
  });

  it('undefined → undefined', () => {
    expect(parseOptionalId(undefined)).toBeUndefined();
  });

  it('"4a" → BadRequestException', () => {
    expect(() => parseOptionalId('4a')).toThrow(BadRequestException);
    expect(() => parseOptionalId('4a')).toThrow('Invalid id: 4a');
  });

  it('"-1" → BadRequestException', () => {
    expect(() => parseOptionalId('-1')).toThrow(BadRequestException);
  });

  it('"" → BadRequestException', () => {
    expect(() => parseOptionalId('')).toThrow(BadRequestException);
  });
});
