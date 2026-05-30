import { QuizQuestionType } from '@prisma/client';
import { calculatePoints } from './quiz-scoring';

describe('calculatePoints', () => {
  describe('ONE_ANSWER: correct option selected → full points', () => {
    it('awards full points', () => {
      const answers = [
        { id: 1n, isCorrect: true },
        { id: 2n, isCorrect: false },
      ];
      expect(
        calculatePoints(
          { type: QuizQuestionType.ONE_ANSWER, points: 5 },
          answers,
          [1n],
        ),
      ).toBe(5);
    });
  });

  describe('ONE_ANSWER: wrong option selected → 0', () => {
    it('returns 0', () => {
      const answers = [
        { id: 1n, isCorrect: true },
        { id: 2n, isCorrect: false },
      ];
      expect(
        calculatePoints(
          { type: QuizQuestionType.ONE_ANSWER, points: 5 },
          answers,
          [2n],
        ),
      ).toBe(0);
    });
  });

  describe('ONE_ANSWER: nothing selected → 0', () => {
    it('returns 0', () => {
      const answers = [
        { id: 1n, isCorrect: true },
        { id: 2n, isCorrect: false },
      ];
      expect(
        calculatePoints(
          { type: QuizQuestionType.ONE_ANSWER, points: 5 },
          answers,
          [],
        ),
      ).toBe(0);
    });
  });

  describe('MULTI_ANSWER: all correct selected, no wrong → full points', () => {
    it('awards full points', () => {
      const answers = [
        { id: 1n, isCorrect: true },
        { id: 2n, isCorrect: true },
        { id: 3n, isCorrect: false },
      ];
      expect(
        calculatePoints(
          { type: QuizQuestionType.MULTI_ANSWER, points: 10 },
          answers,
          [1n, 2n],
        ),
      ).toBe(10);
    });
  });

  describe('MULTI_ANSWER: half the correct selected → proportional (points/correctCount each)', () => {
    it('awards proportional points', () => {
      const answers = [
        { id: 1n, isCorrect: true },
        { id: 2n, isCorrect: true },
        { id: 3n, isCorrect: true },
        { id: 4n, isCorrect: true },
        { id: 5n, isCorrect: false },
      ];
      expect(
        calculatePoints(
          { type: QuizQuestionType.MULTI_ANSWER, points: 8 },
          answers,
          [1n, 2n],
        ),
      ).toBe(4);
    });
  });

  describe('MULTI_ANSWER: one correct + one wrong selected → wrong subtracts pointPerAnswer', () => {
    it('subtracts pointPerAnswer for wrong selection', () => {
      const answers = [
        { id: 1n, isCorrect: true },
        { id: 2n, isCorrect: true },
        { id: 3n, isCorrect: false },
      ];
      expect(
        calculatePoints(
          { type: QuizQuestionType.MULTI_ANSWER, points: 10 },
          answers,
          [1n, 3n],
        ),
      ).toBe(0);
    });
  });

  describe('MULTI_ANSWER: enough wrong picks to go negative → clamped to 0', () => {
    it('clamps score to 0', () => {
      const answers = [
        { id: 1n, isCorrect: true },
        { id: 2n, isCorrect: false },
        { id: 3n, isCorrect: false },
      ];
      expect(
        calculatePoints(
          { type: QuizQuestionType.MULTI_ANSWER, points: 10 },
          answers,
          [2n, 3n],
        ),
      ).toBe(0);
    });
  });

  describe('MULTI_ANSWER with zero correct answers defined → 0 (div-by-zero guard)', () => {
    it('returns 0', () => {
      const answers = [
        { id: 1n, isCorrect: false },
        { id: 2n, isCorrect: false },
      ];
      expect(
        calculatePoints(
          { type: QuizQuestionType.MULTI_ANSWER, points: 10 },
          answers,
          [1n],
        ),
      ).toBe(0);
    });
  });

  describe('MULTI_ANSWER: 10 points across 3 correct → rounded to 2 dp', () => {
    it('rounds to two decimal places', () => {
      const answers = [
        { id: 1n, isCorrect: true },
        { id: 2n, isCorrect: true },
        { id: 3n, isCorrect: true },
      ];
      expect(
        calculatePoints(
          { type: QuizQuestionType.MULTI_ANSWER, points: 10 },
          answers,
          [1n],
        ),
      ).toBe(3.33);
    });
  });

  describe('OPEN_ANSWER and CODING_TASK types → 0', () => {
    it('returns 0 for OPEN_ANSWER', () => {
      const answers = [{ id: 1n, isCorrect: true }];
      expect(
        calculatePoints(
          { type: QuizQuestionType.OPEN_ANSWER, points: 10 },
          answers,
          [1n],
        ),
      ).toBe(0);
    });

    it('returns 0 for CODING_TASK', () => {
      const answers = [{ id: 1n, isCorrect: true }];
      expect(
        calculatePoints(
          { type: QuizQuestionType.CODING_TASK, points: 10 },
          answers,
          [1n],
        ),
      ).toBe(0);
    });
  });
});
