import { QuizQuestionType } from '@prisma/client';

export function calculatePoints(
  question: { type: QuizQuestionType; points: number },
  answers: { id: bigint; isCorrect: boolean }[],
  selectedIds: bigint[],
): number {
  if (question.type === QuizQuestionType.ONE_ANSWER) {
    const selected = answers.find((a) => selectedIds.includes(a.id));
    return selected?.isCorrect ? question.points : 0;
  }
  if (question.type === QuizQuestionType.MULTI_ANSWER) {
    const correctCount = answers.filter((a) => a.isCorrect).length;
    if (correctCount === 0) return 0;
    const pointPerAnswer = question.points / correctCount;
    let score = 0;
    for (const answer of answers) {
      const isSelected = selectedIds.includes(answer.id);
      if (isSelected && answer.isCorrect) score += pointPerAnswer;
      else if (isSelected && !answer.isCorrect) score -= pointPerAnswer;
    }
    return Math.max(0, Math.round(score * 100) / 100);
  }
  return 0;
}
