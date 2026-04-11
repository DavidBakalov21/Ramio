export type ProjectLanguage = 'DOTNET' | 'PYTHON' | 'JAVA' | 'NODE_JS';

export const PROJECT_LANGUAGE_OPTIONS: { value: ProjectLanguage; label: string }[] = [
  { value: 'PYTHON', label: 'Python' },
  { value: 'NODE_JS', label: 'Node.js' },
  { value: 'JAVA', label: 'Java' },
  { value: 'DOTNET', label: '.NET' },
];

export interface CourseProject {
  id: string;
  title: string;
  description: string | null;
  points: number;
  language: ProjectLanguage;
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
  codeBuildId?: string | null;
  codeBuildStatus?: string | null;
  codeBuildPhase?: string | null;
  codeBuildLogsUrl?: string | null;
  codeBuildStartedAt?: string | null;
  codeBuildUpdatedAt?: string | null;
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
