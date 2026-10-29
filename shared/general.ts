import { z } from 'zod';
export const generalRequestSchema = z.object({
  area: z.enum(['vocab', 'grammar', 'reading']),
  pages: z
    .array(
      z.object({
        number: z.number().int().positive(),
        text: z.string().max(30000),
        image: z
          .string()
          .max(2500000)
          .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
          .optional(),
      }),
    )
    .min(1)
    .max(3),
});
export const generalOutputSchema = z.object({
  study: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        text: z.string().max(12000),
        hindi: z.string().max(5000).default(''),
        page: z.number().int().positive(),
      }),
    )
    .max(100),
  questions: z
    .array(
      z.object({
        stem: z.string().min(1).max(12000),
        passage: z.string().max(18000).default(''),
        options: z.array(z.string().min(1).max(4000)).min(2).max(6),
        correctIndex: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        evidence: z.string().min(5).max(12000),
        generated: z.boolean(),
        explanation: z.string().max(4000).default(''),
      }),
    )
    .max(60),
});
export type GeneralOutput = z.infer<typeof generalOutputSchema>;
export type GeneralRequest = z.infer<typeof generalRequestSchema>;
