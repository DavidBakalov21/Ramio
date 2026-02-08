import { Test, TestingModule } from '@nestjs/testing';
import { CodeTestService } from './code-test.service';

describe('CodeTestService', () => {
  let service: CodeTestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CodeTestService],
    }).compile();

    service = module.get<CodeTestService>(CodeTestService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
