import { useLayoutEffect, useState } from 'react';
import { QuestionTracker } from './QuestionTracker';
export function StudyNavigator({
  ids,
  onReveal,
}: {
  ids: string[];
  onReveal: (index: number) => void;
}) {
  const [selection, setSelection] = useState({ index: 0, jump: 0 }),
    [visited, setVisited] = useState<string[]>(ids.slice(0, 1));
  useLayoutEffect(() => {
    if (!selection.jump) return;
    const card = Array.from(document.querySelectorAll<HTMLElement>('[data-study-id]')).find(
      (node) => node.dataset.studyId === ids[selection.index],
    );
    card?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [selection]);
  const move = (next: number) => {
    onReveal(next);
    setVisited((old) => [...new Set([...old, ids[next]])]);
    // Scroll after React commits any additional cards requested by onReveal.
    // The counter also permits jumping to the currently selected card again.
    setSelection((old) => ({ index: next, jump: old.jump + 1 }));
  };
  return ids.length > 0 ? (
    <QuestionTracker
      practice
      study
      ids={ids}
      index={Math.min(selection.index, ids.length - 1)}
      visited={visited}
      answered={(id) => visited.includes(id)}
      onNavigate={move}
    />
  ) : null;
}
