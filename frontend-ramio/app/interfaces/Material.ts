export type CourseMaterialType = 'PDF' | 'VIDEO' | 'FILE' | 'LINK';

export interface CourseMaterial {
  id: string;
  courseId: string;
  type: CourseMaterialType;
  title: string;
  url: string;
  key: string | null;
  name: string | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
}

