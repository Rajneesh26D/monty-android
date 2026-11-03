import { z } from 'zod';

export const quizCustomizationSchema = z.object({
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
});
export type QuizCustomization = z.infer<typeof quizCustomizationSchema>;
export const defaultQuizCustomization: QuizCustomization = {
  shuffleQuestions: false,
  shuffleOptions: false,
};
export const attemptOrderFields = {
  questionOrder: z.array(z.string()).optional(),
  optionOrder: z.record(z.string(), z.array(z.string())).optional(),
};
export interface AttemptOrder {
  questionOrder?: string[];
  optionOrder?: Record<string, string[]>;
}
