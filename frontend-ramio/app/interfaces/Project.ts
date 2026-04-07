export interface CourseProject {
  id: string;
  title: string;
  description: string | null;
  points: number;
  dueDate: string | null;
  assessmentPrompt: string | null;
  createdAt: string;
  updatedAt: string;
  courseId: string;
  submitted?: boolean;
  isChecked?: boolean;
}

export interface ProjectSubmissionListItem {
  id: string;
  projectId: string;
  userId: string;
  completedAt: string;
  url: string;
  key: string;
  name: string;
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

export interface ProjectSubmissionDetail extends ProjectSubmissionListItem {
  url: string;
  key: string;
  name: string;
  project: {
    id: string;
    title: string;
    points?: number;
    assessmentPrompt?: string | null;
  };
}
