export type QuizQuestionType = 'ONE_ANSWER' | 'MULTI_ANSWER' | 'OPEN_ANSWER';
export type QuizSubmissionStatus = 'IN_PROGRESS' | 'SUBMITTED';

export interface QuizAnswer {
  id: string;
  text: string;
  order: number;
  imageUrl?: string | null;
  isCorrect?: boolean;
  isSelected?: boolean;
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  text: string;
  points: number;
  order: number;
  imageUrl?: string | null;
  answers: QuizAnswer[];
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
  questions: {
    id: string;
    type: QuizQuestionType;
    text: string;
    points: number;
    order: number;
    imageUrl?: string | null;
    answers: {
      id: string;
      text: string;
      order: number;
      imageUrl?: string | null;
      isCorrect: boolean;
      isSelected: boolean;
    }[];
    openText: string | null;
    pointsEarned: number | null;
  }[];
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
  questions: {
    id: string;
    type: QuizQuestionType;
    text: string;
    points: number;
    order: number;
    imageUrl?: string | null;
    answers: {
      id: string;
      text: string;
      order: number;
      imageUrl?: string | null;
      isSelected: boolean;
      isCorrect?: boolean;
    }[];
    openText: string | null;
    pointsEarned?: number | null;
  }[];
}
