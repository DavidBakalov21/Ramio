export interface SubmissionListItem {
  id: string;
  assignmentId: string;
  userId: string;
  completedAt: string;
  teacherFeedback: string;
  points: number;
  isChecked: boolean;
  checkedAt: string | null;
  user: {
    id: string;
    username: string | null;
    email: string;
  };
}

export interface SubmissionDetail extends SubmissionListItem {
  solutionContent: string | null;
  assignment: {
    id: string;
    title: string;
    points: number;
    language: string;
  };
}
