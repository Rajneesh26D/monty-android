import type { Workspace, AttemptClock } from './monty';
export type Origin = 'pdf' | 'ai' | 'edited';
export type Kind = 'syn' | 'ant';
export interface Relation {
  term: string;
  explanation: string;
}
export interface SourceRef {
  documentId: string;
  page: number;
}
export interface Entry {
  id: string;
  word: string;
  meaningEn: string;
  meaningHi: string;
  mnemonic: string;
  synonyms: Relation[];
  antonyms: Relation[];
  example: string;
  sources: SourceRef[];
  origins: Partial<
    Record<'meaningEn' | 'meaningHi' | 'mnemonic' | 'synonyms' | 'antonyms' | 'example', Origin>
  >;
}
export interface Document {
  pinned?: boolean;
  folderId?: string;
  id: string;
  name: string;
  hash: string;
  createdAt: number;
  entryIds: string[];
  status: 'ready' | 'pending';
  pendingPages: number[];
  parserVersion?: number;
  error?: string;
}
export interface Option {
  id: string;
  term: string;
  kind: Kind;
  explanation: string;
}
export interface Question {
  id: string;
  entry: Entry;
  options: Option[];
}
export type Answers = Record<string, Record<string, Kind>>;
export interface Result {
  spent?: Record<string, number>;
  elapsedMs?: number;
  wrong?: number;
  unanswered?: number;
  completedAt: number;
  score: number;
  total: number;
  answers: Answers;
}
export interface Draft {
  visited?: string[];
  marked?: string[];
  id?: string;
  clock?: AttemptClock;
  answers: Answers;
  index: number;
  startedAt: number;
}
export interface QuizTest {
  folderId?: string;
  id: string;
  name: string;
  createdAt: number;
  source: 'pdf' | 'combined' | 'bookmarks';
  sourceNames: string[];
  questions: Question[];
  latest?: Result;
  draft?: Draft;
}
export interface State {
  version: 1 | 2;
  monty?: Workspace;
  documents: Document[];
  entries: Record<string, Entry>;
  bookmarks: string[];
  tests: QuizTest[];
  settings: { hideReviewAnswers: boolean; backendUrl: string };
}
export const emptyState = (): State => ({
  version: 1,
  documents: [],
  entries: {},
  bookmarks: [],
  tests: [],
  settings: { hideReviewAnswers: false, backendUrl: '' },
});
export const uid = () =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(
      16,
    ),
  );
