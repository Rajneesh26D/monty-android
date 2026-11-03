import { Home, NotebookPen, Settings } from 'lucide-react';
import { CloudStatus } from './CloudStatus';
export function AppHeader({ onHome, onSettings }: { onHome: () => void; onSettings: () => void }) {
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
