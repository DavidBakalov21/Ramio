import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AssignmentLanguage,
  QuizCodingGradingMode,
  QuizQuestionType,
} from '@prisma/client';
import { AssessQuizSubmissionDto } from './assess-quiz-submission.dto';
import { CreateQuizDto } from './create-quiz.dto';
import { GenerateQuizDto } from './generate-quiz.dto';
import {
  SaveQuizAnswerItemDto,
  SaveQuizAnswersDto,
} from './save-quiz-answers.dto';

async function validationErrors(dto: object) {
  return validate(dto);
}

describe('SaveQuizAnswerItemDto', () => {
  it('questionId Min(1) rejects 0', async () => {
    const dto = plainToInstance(SaveQuizAnswerItemDto, { questionId: 0 });
    const errors = await validationErrors(dto);
    expect(errors.map((e) => e.property)).toContain('questionId');
  });

  it('openText MaxLength(10000) rejects 10001 chars', async () => {
    const dto = plainToInstance(SaveQuizAnswerItemDto, {
      questionId: 1,
      openText: 'x'.repeat(10001),
    });
    const errors = await validationErrors(dto);
    expect(errors.map((e) => e.property)).toContain('openText');
  });

  it('selectedAnswerIds must be numbers', async () => {
    const dto = plainToInstance(SaveQuizAnswerItemDto, {
      questionId: 1,
      selectedAnswerIds: ['not-a-number'],
    });
    const errors = await validationErrors(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('SaveQuizAnswersDto', () => {
  it('nested @ValidateNested rejects a malformed item', async () => {
    const dto = plainToInstance(SaveQuizAnswersDto, {
      answers: [{ questionId: 0 }],
    });
    const errors = await validationErrors(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('CreateQuizDto', () => {
  const validQuestion = {
    type: QuizQuestionType.ONE_ANSWER,
    text: 'Question?',
    points: 1,
    order: 0,
    answers: [{ text: 'A', isCorrect: true, order: 0 }],
  };

  it('requires title and questions', async () => {
    const dto = plainToInstance(CreateQuizDto, { courseId: 1 });
    const errors = await validationErrors(dto);
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['title', 'questions']),
    );
  });

  it('rejects title over 255 chars', async () => {
    const dto = plainToInstance(CreateQuizDto, {
      title: 't'.repeat(256),
      courseId: 1,
      questions: [validQuestion],
    });
    const errors = await validationErrors(dto);
    expect(errors.map((e) => e.property)).toContain('title');
  });

  it('rejects invalid question type enum', async () => {
    const dto = plainToInstance(CreateQuizDto, {
      title: 'Quiz',
      courseId: 1,
      questions: [{ ...validQuestion, type: 'INVALID' }],
    });
    const errors = await validationErrors(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('GenerateQuizDto', () => {
  it('requires courseId and prompt', async () => {
    const dto = plainToInstance(GenerateQuizDto, {});
    const errors = await validationErrors(dto);
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['courseId', 'prompt']),
    );
  });

  it('rejects prompt over 3000 chars', async () => {
    const dto = plainToInstance(GenerateQuizDto, {
      courseId: 1,
      prompt: 'p'.repeat(3001),
    });
    const errors = await validationErrors(dto);
    expect(errors.map((e) => e.property)).toContain('prompt');
  });

  it('rejects questionCount above 20', async () => {
    const dto = plainToInstance(GenerateQuizDto, {
      courseId: 1,
      prompt: 'Make a quiz',
      questionCount: 21,
    });
    const errors = await validationErrors(dto);
    expect(errors.map((e) => e.property)).toContain('questionCount');
  });
});

describe('AssessQuizSubmissionDto', () => {
  it('requires answers array with valid items', async () => {
    const dto = plainToInstance(AssessQuizSubmissionDto, {
      answers: [{ questionId: 0, pointsEarned: -1 }],
    });
    const errors = await validationErrors(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts valid assessment payload', async () => {
    const dto = plainToInstance(AssessQuizSubmissionDto, {
      answers: [{ questionId: 1, pointsEarned: 5 }],
    });
    const errors = await validationErrors(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('CreateQuizDto coding task fields', () => {
  it('accepts valid coding task enum values', async () => {
    const dto = plainToInstance(CreateQuizDto, {
      title: 'Coding quiz',
      courseId: 1,
      questions: [
        {
          type: QuizQuestionType.CODING_TASK,
          text: 'Write code',
          points: 10,
          order: 0,
          codingTaskLanguage: AssignmentLanguage.PYTHON,
          codingTaskTeacherTests: 'import unittest',
          codingTaskGradingMode: QuizCodingGradingMode.TESTS_ONLY,
        },
      ],
    });
    const errors = await validationErrors(dto);
    expect(errors).toHaveLength(0);
  });
});
