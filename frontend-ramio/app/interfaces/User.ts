export interface User {
  id: number;
  email: string;
  role: 'STUDENT' | 'TEACHER' | null;
  username: string | null;
  profilePictureUrl: string | null;
  aboutMe: string | null;
  birthdate: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}