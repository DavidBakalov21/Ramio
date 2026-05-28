import type { AssignmentLanguage } from '@/app/interfaces/Assignment';

export type QuizQuestionType =
  | 'ONE_ANSWER'
  | 'MULTI_ANSWER'
  | 'OPEN_ANSWER'
  | 'CODING_TASK';

export type QuizCodingGradingMode = 'MANUAL_ONLY' | 'TESTS_ONLY';

export type QuizSubmissionStatus = 'IN_PROGRESS' | 'SUBMITTED';

export function isQuizOpenStyleQuestion(type: QuizQuestionType): boolean {
  return type === 'OPEN_ANSWER' || type === 'CODING_TASK';
}

export interface QuizAnswer {
  id: string;
  text: string;
  order: number;
  imageUrl?: string | null;
  isCorrect?: boolean;
  isSelected?: boolean;
}

export interface QuizQuestionBase {
  id: string;
  type: QuizQuestionType;
  text: string;
  points: number;
  order: number;
  imageUrl?: string | null;
  answers: QuizAnswer[];
  codingTaskLanguage?: AssignmentLanguage | null;
  codingTaskStarterCode?: string | null;
  codingTaskTeacherTests?: string | null;
  codingTaskGradingMode?: QuizCodingGradingMode | null;
  codingTaskAiReviewEnabled?: boolean;
  codingTaskAiReviewRubric?: string | null;
}

export interface QuizQuestion extends QuizQuestionBase {
  openText?: string | null;
  pointsEarned?: number | null;
}

export interface Quiz {
  id: string;
  title: string;
  description: string | null;
  courseId: string;
  timeLimit: number | null;
  deadline: string | null;
  allowReview: boolean;
  showCorrectAnswers: boolean;
  showPointsPerQuestion: boolean;
  createdAt: string;
  updatedAt: string;
  questions: QuizQuestion[];
}

export interface QuizListItem {
  id: string;
  title: string;
  description: string | null;
  timeLimit: number | null;
  deadline: string | null;
  allowReview: boolean;
  questionCount: number;
  totalPoints: number;
  submission: {
    id: string;
    status: QuizSubmissionStatus;
    totalPoints: number | null;
  } | null;
}

export interface QuizSubmissionSummary {
  id: string;
  userId: string;
  username: string | null;
  email: string;
  submittedAt: string | null;
  totalPoints: number | null;
  totalMax: number;
  isFullyGraded: boolean;
}

export interface QuizCodingAnswerMeta {
  codingTestStdout?: string | null;
  codingTestStderr?: string | null;
  codingTestExitCode?: number | null;
  codingTestTimedOut?: boolean | null;
  codingTestSuccess?: boolean | null;
  codingAutoPointsEarned?: number | null;
  codingAiReviewText?: string | null;
  codingAiReviewedAt?: string | null;
}

export interface QuizSubmissionDetail {
  id: string;
  quizId: string;
  quizTitle: string;
  userId: string;
  username: string | null;
  email: string;
  submittedAt: string | null;
  totalPoints: number | null;
  totalMax: number;
  questions: (QuizQuestionBase & {
    openText: string | null;
    pointsEarned: number | null;
  } & QuizCodingAnswerMeta)[];
}

export interface OwnQuizSubmission {
  id: string;
  quizId: string;
  status: QuizSubmissionStatus;
  startedAt: string;
  submittedAt: string | null;
  totalPoints: number | null;
  allowReview: boolean;
  showCorrectAnswers: boolean;
  showPointsPerQuestion: boolean;
  questions: (QuizQuestionBase & {
    openText: string | null;
    pointsEarned?: number | null;
  } & QuizCodingAnswerMeta)[];
}

export interface RunQuizCodeResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}
