import type { State } from './types';
import { emptyWorkspace, DEFAULT_VOCAB, freshClock } from './monty';
export function upgradeState(input: State): State {
  if (input.version === 2 && input.monty) {
    // Keep existing nested folders and every content reference, at the topic root.
    const folders = Object.values(input.monty.folders);
    if (folders.every((f) => f.parentId === null)) return input;
    return {
      ...input,
      monty: {
        ...input.monty,
        folders: Object.fromEntries(
          folders.map((f) => [f.id, f.parentId === null ? f : { ...f, parentId: null }]),
        ),
      },
    };
  }
  const state = structuredClone(input);
  state.version = 2;
  state.monty = emptyWorkspace();
  state.documents = state.documents.map((d) => ({ ...d, folderId: d.folderId ?? DEFAULT_VOCAB }));
  state.tests = state.tests.map((t) => ({
    ...t,
    folderId: t.folderId ?? DEFAULT_VOCAB,
    draft: t.draft
      ? { ...t.draft, id: t.draft.id ?? 'legacy-' + t.id, clock: t.draft.clock ?? freshClock() }
      : undefined,
  }));
  state.monty.bookmarks[DEFAULT_VOCAB] = [...state.bookmarks];
  return state;
}
