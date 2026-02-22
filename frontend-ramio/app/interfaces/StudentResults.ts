export interface StudentResultsResponse {
  assignments: {
    id: string;
    title: string;
    maxPoints: number;
  }[];
  students: {
    userId: string;
    username: string | null;
    email: string;
    assignmentResults: ({
      points: number;
      maxPoints: number;
      isChecked: boolean;
    } | null)[];
    totalEarned: number;
    totalMax: number;
  }[];
}
