import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, X } from 'lucide-react';
import { DEFAULT_TIMER_MINUTES, MAX_TIMER_MINUTES } from '../../shared/monty';

export function useTestDuration() {
  const [request, setRequest] = useState<{
    name: string;
    reattempt: boolean;
    count: number;
  } | null>(null);
  const [minutes, setMinutes] = useState(String(DEFAULT_TIMER_MINUTES));
  const resolver = useRef<((value: number | null) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  function close(value: number | null) {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  }
  useEffect(() => {
    if (request) dialog.current?.showModal();
  }, [request]);
  useEffect(
    () => () => {
      resolver.current?.(null);
    },
    [],
  );
  function chooseDuration(name: string, reattempt = false, count = 1): Promise<number | null> {
    resolver.current?.(null);
    setMinutes(String(DEFAULT_TIMER_MINUTES));
    setRequest({ name, reattempt, count });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }
  const timerDialog =
    request &&
    createPortal(
      <dialog
        ref={dialog}
        className="timer-dialog"
        onCancel={() => close(null)}
        aria-labelledby="timer-title"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(minutes);
            if (Number.isInteger(value) && value >= 1 && value <= MAX_TIMER_MINUTES) close(value);
          }}
        >
          <div className="card-heading">
            <span className="timer-icon">
              <Clock3 size={24} />
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Cancel timer setup"
              onClick={() => close(null)}
            >
              <X size={20} />
            </button>
          </div>
          <h2 id="timer-title">
            {request.reattempt ? 'Set your reattempt timer' : 'Set your test timer'}
          </h2>
          <p className="muted timer-test-name">{request.name}</p>
          <p>Start with 15 minutes, or choose the time you need.</p>
          <div className="timer-presets" aria-label="Suggested durations">
            {[5, 15, 30, 60].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={Number(minutes) === value}
                className={Number(minutes) === value ? 'selected' : ''}
                onClick={() => setMinutes(String(value))}
              >
                {value} min
              </button>
            ))}
          </div>
          <label className="field">
            Duration in minutes
            <input
              autoFocus
              required
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_TIMER_MINUTES}
              step={1}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          {request.count > 1 && (
            <p className="muted">
              The first test starts now. Choose a timer for each of the {request.count - 1}{' '}
              remaining tests when you start it.
            </p>
          )}
          <div className="timer-dialog-actions">
            <button type="button" className="secondary" onClick={() => close(null)}>
              Cancel
            </button>
            <button type="submit" className="primary">
              {request.reattempt ? 'Start reattempt' : 'Start test'}
            </button>
          </div>
        </form>
      </dialog>,
      document.body,
    );
  return { chooseDuration, timerDialog };
}
