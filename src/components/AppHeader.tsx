import { setAppearance, useAppearance } from '../services/appearance';
import { Moon, Sun, NotebookPen } from 'lucide-react';
import { CloudStatus } from './CloudStatus';
import { NavigationToggle } from './WorkspaceNavigation';
export function AppHeader({ title = 'Study library' }: { title?: string }) {
  const appearance = useAppearance();
  return (
    <header className="app-header">
      <NavigationToggle />
      <span className="app-brand">
        <NotebookPen size={22} />
        <span>Monty</span>
      </span>
      <div className="header-context">
        <strong className="header-location" title={title}>
          {title}
        </strong>
        <CloudStatus />
      </div>
      <button
        className="icon-button header-theme"
        aria-label={appearance.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={() =>
          setAppearance({ ...appearance, mode: appearance.mode === 'dark' ? 'light' : 'dark' })
        }
      >
        {appearance.mode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </header>
  );
}
