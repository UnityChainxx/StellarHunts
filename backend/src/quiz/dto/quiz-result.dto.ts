// Response-only DTO (issue #529): this shape is never bound as a @Body()
// request type, so it carries no class-validator decorators by design.
export class QuestionResultDto {
  questionId: string;
  question: string;
  selectedOptions: string[];
  correctOptions: string[];
  isCorrect: boolean;
  points: number;
  earnedPoints: number;
  explanation?: string;
}

export class QuizResultDto {
  quizId: string;
  quizTitle: string;
  totalQuestions: number;
  totalPoints: number;
  earnedPoints: number;
  percentage: number;
  passed: boolean;
  timeTaken?: number;
  answers: QuestionResultDto[];
  completedAt: Date;
}
