export interface Course {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  teacherId: string;
  teacherName: string;
  enrollmentCount: number;
  assignmentCount: number;
  isTeacher: boolean;
  isEnrolled: boolean;
}

export interface CoursePage {
  items: Course[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
