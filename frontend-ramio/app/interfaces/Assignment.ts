export type AssignmentLanguage = 'PYTHON' | 'NODE_JS' | 'JAVA' | 'DOTNET';

export interface TestFileInfo {
  id: string;
  url: string;
  key: string;
  name: string;
  language: AssignmentLanguage;
}

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
  tests: TestFileInfo[];
  submitted?: boolean;
  isChecked?: boolean;
}
