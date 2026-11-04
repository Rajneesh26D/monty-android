export function createWorkspaceNavigation() {
  let state = { open: false, busy: false, error: '', hasActiveAttempt: false };
  let guard: (() => Promise<unknown>) | undefined;
  let prepared = false;
  let pending = false;
  let revision = 0;
  const listeners = new Set<() => void>();
  const update = (next: Partial<typeof state>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const closeMenu = () => {
    revision++;
    prepared = false;
    update({ open: false, error: '' });
  };
  const perform = async (action?: () => void | Promise<unknown>) => {
    if (pending) return;
    pending = true;
    let requested = revision;
    update({ busy: true, error: '' });
    try {
      while (!prepared) {
        const current = guard;
        await current?.();
        if (requested !== revision) return;
        prepared = current === guard;
      }
      if (action) {
        closeMenu();
        requested = revision;
        await action();
      } else update({ open: true });
    } catch (error) {
      if (requested === revision)
        update({
          error:
            error instanceof Error
              ? error.message
              : 'Could not save your attempt. Please try again.',
        });
    } finally {
      pending = false;
      update({ busy: false });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    openMenu: () => perform(),
    closeMenu,
    navigate: (action: () => void | Promise<unknown>) => perform(action),
    registerGuard: (next: () => Promise<unknown>) => {
      guard = next;
      prepared = false;
      update({ hasActiveAttempt: true });
      return () => {
        if (guard !== next) return;
        guard = undefined;
        prepared = false;
        update({ hasActiveAttempt: false });
      };
    },
  };
}
