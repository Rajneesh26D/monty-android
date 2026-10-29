import type { State } from '../../shared/types';
import { DEFAULT_VOCAB } from '../../shared/monty';
import type { useStore } from './useStore';
export function scopeState(state: State, folderId: string): State {
  const documents = state.documents.filter((d) => (d.folderId ?? DEFAULT_VOCAB) === folderId),
    tests = state.tests.filter((t) => (t.folderId ?? DEFAULT_VOCAB) === folderId),
    bookmarks =
      state.monty?.bookmarks[folderId] ?? (folderId === DEFAULT_VOCAB ? state.bookmarks : []);
  const ids = new Set([
    ...documents.flatMap((d) => d.entryIds),
    ...bookmarks,
    ...tests.flatMap((t) => t.questions.map((q) => q.entry.id)),
  ]);
  return {
    ...state,
    documents,
    tests,
    bookmarks,
    entries: Object.fromEntries(Object.entries(state.entries).filter(([id]) => ids.has(id))),
  };
}
export function scopedStore(
  store: ReturnType<typeof useStore>,
  folderId: string,
): ReturnType<typeof useStore> {
  return {
    ...store,
    state: store.state ? scopeState(store.state, folderId) : null,
    current: () => scopeState(store.current(), folderId),
    commit: async (update) => {
      await store.commit((global) => {
        const before = scopeState(global, folderId),
          next = typeof update === 'function' ? update(before) : update;
        const documents = [
          ...global.documents.filter((d) => (d.folderId ?? DEFAULT_VOCAB) !== folderId),
          ...next.documents.map((d) => ({ ...d, folderId })),
        ];
        const entries = { ...global.entries, ...next.entries };
        for (const id of Object.keys(before.entries))
          if (!next.entries[id] && !documents.some((d) => d.entryIds.includes(id)))
            delete entries[id];
        const tests = [
          ...next.tests.map((t) => ({ ...t, folderId })),
          ...global.tests.filter((t) => (t.folderId ?? DEFAULT_VOCAB) !== folderId),
        ];
        return {
          ...global,
          documents,
          entries,
          tests,
          bookmarks: folderId === DEFAULT_VOCAB ? next.bookmarks : global.bookmarks,
          settings: next.settings,
          monty: {
            ...global.monty!,
            bookmarks: { ...global.monty!.bookmarks, [folderId]: next.bookmarks },
          },
        };
      });
      return scopeState(store.current(), folderId);
    },
  };
}
