import { useEffect, useRef, useState } from 'react';
import { type State } from '../../shared/types';
import { loadState, requestPersistentStorage, saveState } from './repository';
import { upgradeState } from '../../shared/migrate';
import { importLegacy } from './backup';
export function useStore() {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState('');
  const ref = useRef<State | null>(null);
  useEffect(() => {
    let active = true;
    const receive = (event: Event) => {
      if (!active) return;
      const next = upgradeState((event as CustomEvent<State>).detail);
      ref.current = next;
      setState(next);
    };
    window.addEventListener('vocab:state', receive);
    (async () => {
      let initial = await loadState();
      const old = localStorage.getItem('vm2');
      if (!initial.documents.length && old) {
        initial = upgradeState(importLegacy(JSON.parse(old)));
        await saveState(initial);
        localStorage.removeItem('vm2');
      }
      if (active) {
        ref.current = initial;
        setState(initial);
      }
      await requestPersistentStorage();
    })().catch((e) =>
      setError(
        `Cannot open saved data: ${e.message}. Do not clear app data; restore a backup or retry.`,
      ),
    );
    return () => {
      active = false;
      window.removeEventListener('vocab:state', receive);
    };
  }, []);
  const commit = async (update: State | ((state: State) => State)) => {
    if (!ref.current) throw new Error('Storage is not ready.');
    const previous = ref.current;
    const next = upgradeState(typeof update === 'function' ? update(previous) : update);
    ref.current = next;
    setState(next);
    try {
      await saveState(next, previous);
      setError('');
    } catch (e) {
      setError(
        'Could not save progress. Free some storage and export a backup before closing the app.',
      );
      throw e;
    }
    return next;
  };
  return { state, commit, error, current: () => ref.current! };
}
