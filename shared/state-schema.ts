import { workspaceSchema, clockSchema } from './monty';
import { z } from 'zod';
import { relationSchema } from './validation';
const entry = z.object({
  id: z.string(),
  word: z.string().min(1),
  meaningEn: z.string(),
  meaningHi: z.string(),
  mnemonic: z.string(),
  synonyms: z.array(relationSchema),
  antonyms: z.array(relationSchema),
  example: z.string(),
  sources: z.array(z.object({ documentId: z.string(), page: z.number().int().positive() })),
  origins: z.record(z.string(), z.enum(['pdf', 'ai', 'edited'])),
});
const answers = z.record(z.string(), z.record(z.string(), z.enum(['syn', 'ant'])));
const question = z.object({
  id: z.string(),
  entry,
  options: z
    .array(
      z.object({
        id: z.string(),
        term: z.string(),
        kind: z.enum(['syn', 'ant']),
        explanation: z.string(),
      }),
    )
    .min(1),
});
const quiz = z.object({
  folderId: z.string().optional(),
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  source: z.enum(['pdf', 'combined', 'bookmarks']),
  sourceNames: z.array(z.string()),
  questions: z.array(question).min(1),
  latest: z
    .object({
      completedAt: z.number(),
      spent: z.record(z.string(), z.number()).optional(),
      elapsedMs: z.number().optional(),
      wrong: z.number().optional(),
      unanswered: z.number().optional(),
      score: z.number().int().nonnegative(),
      total: z.number().int().positive(),
      answers,
    })
    .optional(),
  draft: z
    .object({
      answers,
      visited: z.array(z.string()).optional(),
      marked: z.array(z.string()).optional(),
      index: z.number().int().nonnegative(),
      startedAt: z.number(),
      id: z.string().optional(),
      clock: clockSchema.optional(),
    })
    .optional(),
});
export const stateSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  monty: workspaceSchema.optional(),
  documents: z.array(
    z.object({
      pinned: z.boolean().optional(),
      id: z.string(),
      folderId: z.string().optional(),
      name: z.string(),
      hash: z.string(),
      createdAt: z.number(),
      entryIds: z.array(z.string()),
      status: z.enum(['ready', 'pending']),
      pendingPages: z.array(z.number().int().positive()),
      parserVersion: z.number().int().nonnegative().optional(),
      error: z.string().optional(),
    }),
  ),
  entries: z.record(z.string(), entry),
  bookmarks: z.array(z.string()),
  tests: z.array(quiz),
  settings: z.object({ hideReviewAnswers: z.boolean(), backendUrl: z.string() }),
});
