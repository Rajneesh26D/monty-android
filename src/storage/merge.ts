import { upgradeState } from '../../shared/migrate';
import type { Workspace, Exam } from '../../shared/monty';
import type { State, QuizTest } from '../../shared/types';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function mergeAttemptFlags(
  base: { visited?: string[]; marked?: string[] } | undefined,
  local: { visited?: string[]; marked?: string[] },
  remote: { visited?: string[]; marked?: string[] },
  merged: { visited?: string[]; marked?: string[] },
) {
  if (local.visited || remote.visited)
    merged.visited = [...new Set([...(local.visited ?? []), ...(remote.visited ?? [])])];
  if (local.marked || remote.marked)
    merged.marked = [...new Set([...(local.marked ?? []), ...(remote.marked ?? [])])].filter(
      (id) =>
        !base?.marked?.includes(id) ||
        (!!local.marked?.includes(id) && !!remote.marked?.includes(id)),
    );
}
// A three-way merge applies only changes made since the last acknowledged save.
// Missing records are deletions, so stale tabs cannot bring deleted tests back.
function value(base: any, local: any, remote: any): any {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  if (
    local &&
    remote &&
    !Array.isArray(local) &&
    typeof local === 'object' &&
    typeof remote === 'object'
  ) {
    return Object.fromEntries(
      [...new Set([...Object.keys(remote), ...Object.keys(local)])]
        .map((k) => [k, value(base?.[k], local[k], remote[k])])
        .filter(([, v]) => v !== undefined),
    );
  }
  return local;
}
function records<T extends { id: string }>(
  base: T[] | undefined,
  local: T[],
  remote: T[],
  merge = value,
): T[] {
  const b = new Map(base?.map((x) => [x.id, x])),
    l = new Map(local.map((x) => [x.id, x])),
    r = new Map(remote.map((x) => [x.id, x]));
  return [...new Set([...local.map((x) => x.id), ...remote.map((x) => x.id)])].flatMap((id) => {
    if (b.has(id) && (!l.has(id) || !r.has(id))) return [];
    const a = l.get(id),
      c = r.get(id);
    return a && c ? [merge(b.get(id), a, c)] : a ? [a] : c ? [c] : [];
  });
}
function test(base: QuizTest | undefined, local: QuizTest, remote: QuizTest): QuizTest {
  const merged = value(base, local, remote) as QuizTest;
  if (local.draft && remote.draft && merged.draft && local.draft.id === remote.draft.id)
    mergeAttemptFlags(base?.draft, local.draft, remote.draft, merged.draft);
  if (local.latest && remote.latest)
    merged.latest =
      local.latest.completedAt >= remote.latest.completedAt ? local.latest : remote.latest;
  if (
    local.draft?.clock &&
    remote.draft?.clock &&
    local.draft.id === remote.draft.id &&
    merged.draft
  )
    merged.draft.clock =
      local.draft.clock.updatedAt >= remote.draft.clock.updatedAt
        ? local.draft.clock
        : remote.draft.clock;
  // Never revive an attempt already completed elsewhere.
  if (merged.draft && merged.latest && merged.latest.completedAt >= merged.draft.startedAt)
    merged.draft = undefined;
  if (local.draft && remote.draft && local.draft.startedAt !== remote.draft.startedAt) {
    const newer = local.draft.startedAt > remote.draft.startedAt ? local : remote;
    merged.questions = newer.questions;
    merged.draft = newer.draft;
    if (merged.latest && merged.latest.completedAt >= newer.draft!.startedAt)
      merged.draft = undefined;
  }
  return merged;
}
export function mergeCloudState(base: State | undefined, local: State, remote: State): State {
  if (local.version === 2 || remote.version === 2) {
    local = upgradeState(local);
    remote = upgradeState(remote);
    if (base) base = upgradeState(base);
  }
  const entries = records(
    base && Object.values(base.entries),
    Object.values(local.entries),
    Object.values(remote.entries),
  );
  const available = new Set(entries.map((e) => e.id));
  const bookmarks = [...new Set([...remote.bookmarks, ...local.bookmarks])].filter((id) => {
    if (!available.has(id)) return false;
    return base?.bookmarks.includes(id)
      ? local.bookmarks.includes(id) && remote.bookmarks.includes(id)
      : true;
  });
  return {
    version: local.version === 2 || remote.version === 2 ? 2 : 1,
    ...(local.monty && remote.monty
      ? { monty: mergeWorkspace(base?.monty, local.monty, remote.monty) }
      : {}),
    documents: records(base?.documents, local.documents, remote.documents).map((d) => ({
      ...d,
      entryIds: d.entryIds.filter((id) => available.has(id)),
    })),
    entries: Object.fromEntries(entries.map((e) => [e.id, e])),
    bookmarks,
    tests: records(base?.tests, local.tests, remote.tests, test),
    settings: value(base?.settings, local.settings, remote.settings),
  };
}

function maps<T extends { id: string }>(
  b: Record<string, T> | undefined,
  l: Record<string, T>,
  r: Record<string, T>,
  m = value,
): Record<string, T> {
  return Object.fromEntries(
    records(b && Object.values(b), Object.values(l), Object.values(r), m).map((x) => [x.id, x]),
  );
}
function sets(
  b: Record<string, string[]> | undefined,
  l: Record<string, string[]>,
  r: Record<string, string[]>,
) {
  return Object.fromEntries(
    [...new Set([...Object.keys(l), ...Object.keys(r)])].map((k) => [
      k,
      [...new Set([...(l[k] ?? []), ...(r[k] ?? [])])].filter((id) =>
        b?.[k]?.includes(id) ? (l[k] ?? []).includes(id) && (r[k] ?? []).includes(id) : true,
      ),
    ]),
  );
}
function exam(b: Exam | undefined, l: Exam, r: Exam): Exam {
  const out = value(b, l, r) as Exam;
  if (l.latest && r.latest)
    out.latest = l.latest.completedAt >= r.latest.completedAt ? l.latest : r.latest;
  if (l.draft && r.draft) {
    if (l.draft.id !== r.draft.id)
      out.draft = l.draft.startedAt >= r.draft.startedAt ? l.draft : r.draft;
    else if (out.draft) {
      mergeAttemptFlags(b?.draft, l.draft, r.draft, out.draft);
      out.draft.clock =
        l.draft.clock.updatedAt >= r.draft.clock.updatedAt ? l.draft.clock : r.draft.clock;
    }
  }
  if (out.draft && out.latest && out.latest.completedAt >= out.draft.startedAt)
    out.draft = undefined;
  return out;
}
function mergeWorkspace(b: Workspace | undefined, l: Workspace, r: Workspace): Workspace {
  const folders = maps(b?.folders, l.folders, r.folders);
  const cleanFolders = <T extends { folderId: string }>(map: Record<string, T>) =>
    Object.fromEntries(Object.entries(map).filter(([, item]) => !!folders[item.folderId]));
  const cleanSets = (map: Record<string, string[]>) =>
    Object.fromEntries(Object.entries(map).filter(([id]) => !!folders[id]));
  return {
    folders,
    attachments: cleanFolders(maps(b?.attachments, l.attachments, r.attachments)),
    banks: maps(b?.banks, l.banks, r.banks),
    tests: cleanFolders(maps(b?.tests, l.tests, r.tests, exam)),
    practice: value(b?.practice, l.practice, r.practice),
    bookmarks: cleanSets(sets(b?.bookmarks, l.bookmarks, r.bookmarks)),
    mathPracticeBookmarks: cleanSets(
      sets(b?.mathPracticeBookmarks, l.mathPracticeBookmarks, r.mathPracticeBookmarks),
    ),
    mathTestBookmarks: cleanSets(
      sets(b?.mathTestBookmarks, l.mathTestBookmarks, r.mathTestBookmarks),
    ),
    seedVersion: Math.max(l.seedVersion, r.seedVersion),
  };
}
