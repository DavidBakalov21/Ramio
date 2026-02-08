import { Test, TestingModule } from '@nestjs/testing';
import { CodeTestController } from './code-test.controller';

describe('CodeTestController', () => {
  let controller: CodeTestController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CodeTestController],
    }).compile();

    controller = module.get<CodeTestController>(CodeTestController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
