export interface Course {
  id: string;
  title: string;
  description: string | null;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
  teacherId: string;
  teacherName: string;
  enrollmentCount: number;
  assignmentCount: number;
  projectCount?: number;
  isTeacher: boolean;
  isCourseOwner?: boolean;
  isEnrolled: boolean;
  hasPendingRequest?: boolean;
  pendingRequestCount?: number;
}

export interface PendingEnrollmentRequest {
  id: string;
  courseId: string;
  userId: string;
  requestedAt: string;
  username: string | null;
  email: string;
}

export interface CourseAssistant {
  userId: string;
  username: string | null;
  email: string;
  joinedAt: string;
}

export interface PendingCourseAssistantInvite {
  id: string;
  userId: string;
  username: string | null;
  email: string;
  invitedAt: string;
}

export interface CourseAssistantsResponse {
  assistants: CourseAssistant[];
  pendingInvites: PendingCourseAssistantInvite[];
}

export interface MyCourseAssistantInvite {
  id: string;
  courseId: string;
  courseTitle: string;
  invitedAt: string;
  inviterName: string;
  ownerName: string;
}

export interface CoursePage {
  items: Course[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
