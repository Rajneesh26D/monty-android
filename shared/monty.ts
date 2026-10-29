import { z } from 'zod';
export type Area = 'maths' | 'vocab' | 'grammar' | 'reading';
export const folderSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  area: z.enum(['maths', 'vocab', 'grammar', 'reading']),
  name: z.string(),
  pinned: z.boolean().default(false),
  profile: z.enum(['auto', 'vocab', 'idioms', 'maths']).default('auto'),
  createdAt: z.number(),
});
export type Folder = z.infer<typeof folderSchema>;
export const clockSchema = z.object({
  remainingMs: z.number().min(0).max(900000),
  spent: z.record(z.string(), z.number().nonnegative()),
  updatedAt: z.number(),
  paused: z.boolean().default(true),
});
export type AttemptClock = z.infer<typeof clockSchema>;
export const mcqSchema = z
  .object({
    id: z.string(),
    number: z.number().int().positive(),
    stem: z.string().min(1).max(18000),
    meaningHi: z.string().default(''),
    passage: z.string().default(''),
    options: z
      .array(z.object({ id: z.string(), label: z.string(), text: z.string().min(1) }))
      .min(2)
      .max(8),
    answerId: z.string(),
    page: z.number().int().positive(),
    pages: z.array(z.number().int().positive()).default([]),
    origin: z.enum(['pdf', 'ai']),
    answerOrigin: z.enum(['pdf', 'ai']).default('pdf'),
    evidence: z.string().default(''),
    explanation: z.string().default(''),
  })
  .refine((q) => q.options.some((o) => o.id === q.answerId), 'Answer must match an option');
export type MCQ = z.infer<typeof mcqSchema>;
export const studySchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  hindi: z.string().default(''),
  page: z.number().int().positive(),
  mnemonic: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
  example: z.string().optional(),
});
export type StudyItem = z.infer<typeof studySchema>;
export const bankSchema = z.object({
  version: z.literal(1),
  mathLayoutVersion: z.number().int().positive().optional(),
  id: z.string(),
  kind: z.enum(['maths', 'idioms', 'general']),
  questions: z.array(mcqSchema),
  study: z.array(studySchema),
  warnings: z.array(z.string()).default([]),
});
export type Bank = z.infer<typeof bankSchema>;
export const attachmentSchema = z.object({
  id: z.string(),
  folderId: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number().nonnegative(),
  pinned: z.boolean().default(false),
  kind: z.enum(['note', 'practice']),
  createdAt: z.number(),
  hash: z.string().optional(),
  bankId: z.string().optional(),
  count: z.number().default(0),
  status: z.enum(['saved', 'reading', 'pending', 'review', 'ready']).default('saved'),
  error: z.string().optional(),
});
export type Attachment = z.infer<typeof attachmentSchema>;
const choices = z.record(z.string(), z.string());
export const examSchema = z.object({
  id: z.string(),
  folderId: z.string(),
  attachmentId: z.string(),
  bankId: z.string(),
  name: z.string(),
  source: z.enum(['pdf', 'combined', 'bookmarks']).default('pdf'),
  questionIds: z.array(z.string()).min(1),
  createdAt: z.number(),
  draft: z
    .object({
      id: z.string(),
      index: z.number().int().nonnegative(),
      answers: choices,
      visited: z.array(z.string()).optional(),
      marked: z.array(z.string()).optional(),
      clock: clockSchema,
      startedAt: z.number(),
    })
    .optional(),
  latest: z
    .object({
      completedAt: z.number(),
      answers: choices,
      correct: z.number(),
      wrong: z.number(),
      unanswered: z.number(),
      spent: z.record(z.string(), z.number()),
      elapsedMs: z.number(),
      total: z.number(),
    })
    .optional(),
});
export type Exam = z.infer<typeof examSchema>;
export const workspaceSchema = z.object({
  folders: z.record(z.string(), folderSchema),
  attachments: z.record(z.string(), attachmentSchema),
  banks: z.record(
    z.string(),
    z.object({
      id: z.string(),
      kind: z.enum(['maths', 'idioms', 'general']),
      count: z.number(),
      studyCount: z.number(),
    }),
  ),
  tests: z.record(z.string(), examSchema),
  practice: z.record(
    z.string(),
    z.object({
      index: z.number(),
      answers: choices,
      visited: z.array(z.string()).optional(),
      updatedAt: z.number(),
    }),
  ),
  bookmarks: z.record(z.string(), z.array(z.string())),
  mathPracticeBookmarks: z.record(z.string(), z.array(z.string())),
  mathTestBookmarks: z.record(z.string(), z.array(z.string())),
  seedVersion: z.number().default(0),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export const DEFAULT_VOCAB = 'english-vocab-anto-syno';
export const DEFAULT_IDIOMS = 'english-vocab-idioms';
export const DEFAULT_MATHS = 'maths-percentage';
export const emptyWorkspace = (): Workspace => ({
  folders: {
    [DEFAULT_VOCAB]: {
      id: DEFAULT_VOCAB,
      parentId: null,
      area: 'vocab',
      name: 'Anto / Syno',
      pinned: false,
      profile: 'vocab',
      createdAt: 0,
    },
    [DEFAULT_IDIOMS]: {
      id: DEFAULT_IDIOMS,
      parentId: null,
      area: 'vocab',
      name: 'Idioms',
      pinned: false,
      profile: 'idioms',
      createdAt: 1,
    },
    [DEFAULT_MATHS]: {
      id: DEFAULT_MATHS,
      parentId: null,
      area: 'maths',
      name: 'Percentage',
      pinned: false,
      profile: 'maths',
      createdAt: 2,
    },
  },
  attachments: {},
  banks: {},
  tests: {},
  practice: {},
  bookmarks: {},
  mathPracticeBookmarks: {},
  mathTestBookmarks: {},
  seedVersion: 0,
});
export const freshClock = (): AttemptClock => ({
  remainingMs: 900000,
  spent: {},
  updatedAt: Date.now(),
  paused: true,
});
