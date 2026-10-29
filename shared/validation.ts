import { z } from 'zod';
export const relationSchema = z.object({
  term: z.string().trim().min(1).max(160),
  explanation: z.string().trim().max(1500).default(''),
});
export const aiEntrySchema = z
  .object({
    candidateId: z.string().max(100).optional(),
    word: z.string().trim().min(1).max(100),
    meaningEn: z.string().trim().max(3000),
    meaningHi: z.string().trim().max(3000),
    mnemonic: z.string().trim().max(3000),
    synonyms: z.array(relationSchema).max(20),
    antonyms: z.array(relationSchema).max(20),
    example: z.string().trim().max(3000),
    sourcePages: z.array(z.number().int().positive()).min(1).max(20),
  })
  .refine((e) => {
    const a = e.synonyms.map((x) => x.term.toLocaleLowerCase());
    const b = e.antonyms.map((x) => x.term.toLocaleLowerCase());
    return (
      new Set(a).size === a.length && new Set(b).size === b.length && !a.some((x) => b.includes(x))
    );
  }, 'Synonyms and antonyms must be distinct and must not overlap');
export const aiResponseSchema = z.object({ entries: z.array(aiEntrySchema).max(150) });
export const candidateSchema = z.object({
  word: z.string().trim().min(1).max(100),
  meaningEn: z.string().max(3000).default(''),
  meaningHi: z.string().max(3000).default(''),
  mnemonic: z.string().max(3000).default(''),
  example: z.string().max(3000).default(''),
  synonyms: z.array(relationSchema).max(20).default([]),
  antonyms: z.array(relationSchema).max(20).default([]),
  sourcePages: z.array(z.number().int().positive()).min(1).max(20),
});
export const discoverySchema = z.object({ candidates: z.array(candidateSchema).max(150) });
export const pageSchema = z.object({
  number: z.number().int().positive(),
  text: z.string().max(50000),
  image: z
    .string()
    .max(2_500_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .optional(),
});
export const processSchema = z.object({
  mode: z.enum(['discover', 'enrich']),
  pages: z.array(pageSchema).max(3),
  entries: z.array(aiEntrySchema).max(8).default([]),
});
export type AIEntry = z.infer<typeof aiEntrySchema>;
export type ProcessRequest = z.infer<typeof processSchema>;
