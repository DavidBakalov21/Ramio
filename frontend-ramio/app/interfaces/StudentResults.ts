export type ResultCell = {
  points: number;
  maxPoints: number;
  isChecked: boolean;
} | null;

export interface StudentResultsResponse {
  assignments: {
    id: string;
    title: string;
    maxPoints: number;
  }[];
  projects: {
    id: string;
    title: string;
    maxPoints: number;
  }[];
  students: {
    userId: string;
    username: string | null;
    email: string;
    assignmentResults: ResultCell[];
    projectResults: ResultCell[];
    totalEarned: number;
    totalMax: number;
  }[];
}
