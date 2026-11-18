import { NotebookPen } from 'lucide-react';
import { CloudStatus } from './CloudStatus';
import { NavigationToggle } from './WorkspaceNavigation';
export function AppHeader({ title = 'Study library' }: { title?: string }) {
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
    </header>
  );
}
