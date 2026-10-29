import { useEffect, useRef, useState } from 'react';
import type { AttemptClock } from '../../shared/monty';
import { advanceClock } from '../core/exams';
import { saveClock } from '../storage/repository';
export function useAttemptClock(
  id: string | undefined,
  questionId: string | undefined,
  initial: AttemptClock | undefined,
  persist: (clock: AttemptClock) => Promise<unknown>,
  expire: (clock: AttemptClock) => Promise<unknown>,
) {
  const options = useRef({ persist, expire });
  options.current = { persist, expire };
  const live = useRef<AttemptClock | undefined>(initial),
    last = useRef(performance.now()),
    active = useRef(false),
    held = useRef(false),
    qid = useRef(questionId ?? ''),
    lastSave = useRef(0),
    expiring = useRef(false);
  const [display, setDisplay] = useState(initial?.remainingMs ?? 900000),
    [paused, setPaused] = useState(true),
    [busy, setBusy] = useState(false);
  const capture = () => {
    if (live.current && active.current) {
      const now = performance.now();
      live.current = advanceClock(live.current, qid.current, now - last.current);
      last.current = now;
    }
    return live.current;
  };
  const flush = async () => {
    const clock = capture();
    if (id && clock) {
      await saveClock(id, clock);
      await options.current.persist({ ...clock });
    }
  };
  const pause = async () => {
    capture();
    active.current = false;
    if (live.current) live.current = { ...live.current, paused: true, updatedAt: Date.now() };
    setPaused(true);
    await flush();
  };
  const resume = async () => {
    if (!live.current || !held.current) return;
    live.current = { ...live.current, paused: false, updatedAt: Date.now() };
    last.current = performance.now();
    active.current = true;
    setPaused(false);
    await flush();
  };
  useEffect(() => {
    if (!id || !initial) return;
    let cancelled = false;
    const persistThisAttempt = options.current.persist;
    let release: (() => void) | undefined;
    live.current = { ...initial, spent: { ...initial.spent }, paused: true };
    setDisplay(initial.remainingMs);
    setPaused(true);
    expiring.current = false;
    lastSave.current = performance.now();
    const acquire = async () => {
      if (cancelled) return;
      held.current = true;
      setBusy(false);
      if (!initial.paused) {
        active.current = true;
        live.current!.paused = false;
        last.current = performance.now();
        setPaused(false);
      }
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      held.current = false;
    };
    if (navigator.locks) {
      setBusy(true);
      void navigator.locks.request('monty-attempt-' + id, acquire);
    } else void acquire();
    const timer = setInterval(() => {
      const clock = capture();
      if (!clock) return;
      setDisplay(clock.remainingMs);
      if (active.current) {
        void saveClock(id, clock);
        if (performance.now() - lastSave.current > 5000) {
          lastSave.current = performance.now();
          void options.current.persist({ ...clock });
        }
      }
      if (active.current && clock.remainingMs <= 0 && !expiring.current) {
        expiring.current = true;
        active.current = false;
        clock.paused = true;
        void options.current.expire({ ...clock });
      }
    }, 1000);
    const hide = () => {
      if (document.visibilityState !== 'visible') void pause();
    };
    const pagehide = () => void pause();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pagehide);
    return () => {
      cancelled = true;
      capture();
      active.current = false;
      clearInterval(timer);
      if (live.current) {
        live.current.paused = true;
        void saveClock(id, live.current).catch(() => {});
        void persistThisAttempt({ ...live.current }).catch(() => {});
      }
      release?.();
      held.current = false;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', pagehide);
    };
  }, [id]);
  useEffect(() => {
    if (qid.current !== questionId) {
      capture();
      qid.current = questionId ?? '';
      last.current = performance.now();
    }
  }, [questionId]);
  return { remaining: display, paused, busy, pause, resume, flush, capture };
}
