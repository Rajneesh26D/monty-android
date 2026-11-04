import { expect, it, vi } from 'vitest';
import { createWorkspaceNavigation } from '../src/core/workspaceNavigation';

it('starts with a collapsed menu and opens and closes repeatedly', async () => {
  const navigation = createWorkspaceNavigation();
  expect(navigation.getSnapshot()).toEqual({
    open: false,
    busy: false,
    error: '',
    hasActiveAttempt: false,
  });
  await navigation.openMenu();
  expect(navigation.getSnapshot().open).toBe(true);
  navigation.closeMenu();
  expect(navigation.getSnapshot().open).toBe(false);
  await navigation.openMenu();
  expect(navigation.getSnapshot().open).toBe(true);
});

it('waits for a running test to pause and save before opening navigation', async () => {
  const navigation = createWorkspaceNavigation();
  let saved!: () => void;
  const pause = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      }),
  );
  navigation.registerGuard(pause);
  const opening = navigation.openMenu();
  expect(navigation.getSnapshot()).toMatchObject({
    open: false,
    busy: true,
    hasActiveAttempt: true,
  });
  saved();
  await opening;
  expect(navigation.getSnapshot()).toMatchObject({ open: true, busy: false });
  const goHome = vi.fn();
  await navigation.navigate(goHome);
  expect(goHome).toHaveBeenCalledOnce();
  expect(pause).toHaveBeenCalledOnce();
  expect(navigation.getSnapshot().open).toBe(false);
});

it('saves before direct navigation and closes before changing the view', async () => {
  const navigation = createWorkspaceNavigation();
  const events: string[] = [];
  navigation.registerGuard(async () => {
    events.push('saved');
  });
  await navigation.navigate(() => {
    events.push('navigated');
    expect(navigation.getSnapshot().open).toBe(false);
  });
  expect(events).toEqual(['saved', 'navigated']);
});

it('keeps the current test visible when saving fails and permits a retry', async () => {
  const navigation = createWorkspaceNavigation();
  const pause = vi
    .fn()
    .mockRejectedValueOnce(new Error('Storage unavailable'))
    .mockResolvedValue(undefined);
  navigation.registerGuard(pause);
  await navigation.openMenu();
  expect(navigation.getSnapshot()).toMatchObject({
    open: false,
    busy: false,
    error: 'Storage unavailable',
  });
  await navigation.openMenu();
  expect(navigation.getSnapshot()).toMatchObject({ open: true, error: '' });
});

it('does not navigate away if a test cannot be saved', async () => {
  const navigation = createWorkspaceNavigation();
  navigation.registerGuard(async () => {
    throw new Error('Could not save');
  });
  const changeFolder = vi.fn();
  await navigation.navigate(changeFolder);
  expect(changeFolder).not.toHaveBeenCalled();
  expect(navigation.getSnapshot().error).toBe('Could not save');
});

it('ignores duplicate clicks while saving a test', async () => {
  const navigation = createWorkspaceNavigation();
  let saved!: () => void;
  const pause = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      }),
  );
  navigation.registerGuard(pause);
  const opening = navigation.openMenu();
  await navigation.openMenu();
  const action = vi.fn();
  await navigation.navigate(action);
  expect(pause).toHaveBeenCalledOnce();
  expect(action).not.toHaveBeenCalled();
  saved();
  await opening;
});

it('keeps a cancelled menu closed when saving finishes later', async () => {
  const navigation = createWorkspaceNavigation();
  let saved!: () => void;
  navigation.registerGuard(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      }),
  );
  const opening = navigation.openMenu();
  navigation.closeMenu();
  saved();
  await opening;
  expect(navigation.getSnapshot()).toMatchObject({ open: false, busy: false, error: '' });
});

it('does not discard a newer attempt guard during an older attempt cleanup', async () => {
  const navigation = createWorkspaceNavigation();
  const older = vi.fn().mockResolvedValue(undefined);
  const newer = vi.fn().mockResolvedValue(undefined);
  const removeOlder = navigation.registerGuard(older);
  const removeNewer = navigation.registerGuard(newer);
  removeOlder();
  await navigation.openMenu();
  expect(older).not.toHaveBeenCalled();
  expect(newer).toHaveBeenCalledOnce();
  removeNewer();
  expect(navigation.getSnapshot().hasActiveAttempt).toBe(false);
});

it('saves a new attempt that appears while an earlier save is pending', async () => {
  const navigation = createWorkspaceNavigation();
  let saved!: () => void;
  navigation.registerGuard(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      }),
  );
  const opening = navigation.openMenu();
  const newer = vi.fn().mockResolvedValue(undefined);
  navigation.registerGuard(newer);
  saved();
  await opening;
  expect(newer).toHaveBeenCalledOnce();
  expect(navigation.getSnapshot().open).toBe(true);
});

it('notifies consumers and stops notifying after unsubscribe', async () => {
  const navigation = createWorkspaceNavigation();
  const listener = vi.fn();
  const stop = navigation.subscribe(listener);
  await navigation.openMenu();
  expect(listener).toHaveBeenCalled();
  stop();
  listener.mockClear();
  navigation.closeMenu();
  expect(listener).not.toHaveBeenCalled();
});
