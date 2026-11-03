import { setAppearance, useAppearance } from '../services/appearance';
import { Moon, Sun } from 'lucide-react';
import { Home, NotebookPen, Settings } from 'lucide-react';
import { CloudStatus } from './CloudStatus';
export function AppHeader({ onHome, onSettings }: { onHome: () => void; onSettings: () => void }) {
  const appearance = useAppearance();
  return (
    <header className="app-header">
      <button className="brand brand-button" aria-label="Monty home" onClick={onHome}>
        <span className="brand-mark">
          <NotebookPen size={26} />
        </span>
        <span>Monty</span>
      </button>
      <div className="header-context">
        <span className="header-greeting">Your learning workspace</span>
        <CloudStatus />
      </div>
      <div className="header-actions">
        <button
          className="icon-button"
          aria-label={appearance.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() =>
            setAppearance({ ...appearance, mode: appearance.mode === 'dark' ? 'light' : 'dark' })
          }
        >
          {appearance.mode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button className="home-button" onClick={onHome}>
          <Home size={18} />
          <span>Home</span>
        </button>
        <button className="icon-button header-settings" aria-label="Settings" onClick={onSettings}>
          <Settings size={21} />
        </button>
      </div>
    </header>
  );
}
