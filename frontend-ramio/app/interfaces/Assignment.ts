export interface Assignment {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  courseId: string;
  test: { id: string; url: string; key: string; name: string } | null;
}
