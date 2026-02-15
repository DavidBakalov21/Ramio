export type AssignmentLanguage = 'PYTHON' | 'NODE_JS';

export interface Assignment {
  id: string;
  title: string;
  description: string | null;
  points: number;
  language: AssignmentLanguage;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  courseId: string;
  test: { id: string; url: string; key: string; name: string } | null;
  submitted?: boolean;
}
