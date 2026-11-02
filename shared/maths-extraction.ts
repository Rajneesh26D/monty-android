import { z } from 'zod';
export const mathsRequestSchema = z.object({
  area: z.literal('maths'),
  pages: z
    .array(
      z.object({
        number: z.number().int().positive(),
        text: z.string().max(40000),
        image: z
          .string()
          .max(2500000)
          .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
          .optional(),
      }),
    )
    .min(1)
    .max(3),
  targets: z.array(z.number().int().positive()).max(60),
  answers: z
    .array(
      z.object({
        number: z.number().int().positive(),
        part: z.string().max(20).default(''),
        answerId: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']),
      }),
    )
    .max(2000),
});
export const mathsOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        number: z.number().int().positive(),
        part: z.string().max(20).default(''),
        stem: z.string().min(5).max(18000),
        options: z.array(z.string().min(1).max(4000)).min(2).max(8),
        answerId: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']),
        page: z.number().int().positive(),
        evidence: z.string().min(12).max(4000),
        explanation: z.string().max(4000).default(''),
        answerOrigin: z.enum(['pdf', 'ai']),
      }),
    )
    .max(80),
  unresolved: z.array(z.number().int().positive()).default([]),
});
export type MathsRequest = z.infer<typeof mathsRequestSchema>;
export type MathsOutput = z.infer<typeof mathsOutputSchema>;
