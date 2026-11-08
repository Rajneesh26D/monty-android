import { z } from 'zod';
export const readerThemes = ['midnight', 'paper', 'slate', 'gold', 'editorial'] as const;
export type ReaderTheme = (typeof readerThemes)[number];
const term = z.string().trim().min(1).max(100);
const relations = z
  .array(term)
  .length(3)
  .refine((v) => new Set(v.map((s) => s.toLowerCase())).size === 3, 'Relations must be distinct');
export const wordMeaningSchema = z.object({
  word: z.string().trim().min(1).max(80),
  partOfSpeech: z.string().trim().max(80),
  meaningEn: z.string().trim().min(1).max(1200),
  meaningHi: z
    .string()
    .trim()
    .min(1)
    .max(1200)
    .regex(/[\u0900-\u097f]/, 'Hindi must use Devanagari'),
  synonyms: relations,
  antonyms: relations,
});
export type WordMeaning = z.infer<typeof wordMeaningSchema>;
export const lookupRequestSchema = z.object({
  word: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z]+(?:['’\-][A-Za-z]+)*$/),
  context: z.string().trim().max(2000).default(''),
});
export const articleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  title: z.string().trim().min(1).max(200),
  createdAt: z.number(),
  wordCount: z.number().int().nonnegative(),
  preview: z.string().max(250),
});
export const savedWordSchema = wordMeaningSchema.extend({
  id: z.string().max(100),
  articleTitle: z.string().max(200),
  context: z.string().max(2000),
  savedAt: z.number(),
});
export const readingSchema = z.object({
  articles: z.record(z.string(), articleSchema),
  words: z.record(z.string(), savedWordSchema),
});
export type ReadingLibrary = z.infer<typeof readingSchema>;
export type ReadingArticle = z.infer<typeof articleSchema>;
export type SavedWord = z.infer<typeof savedWordSchema>;
export const emptyReading = (): ReadingLibrary => ({ articles: {}, words: {} });
export type ArticleBlock = { kind: 'paragraph' | 'heading' | 'quote'; text: string };
export const articleContentSchema = z.object({
  blocks: z
    .array(
      z.object({
        kind: z.enum(['paragraph', 'heading', 'quote']),
        text: z.string().max(2_000_000),
      }),
    )
    .min(1),
});
