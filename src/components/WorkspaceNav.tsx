import {
  BookOpen,
  Calculator,
  ChevronRight,
  Home,
  Library,
  NotebookPen,
  Settings,
  Sparkles,
} from 'lucide-react';
import type { State } from '../../shared/types';
import type { Area, Folder } from '../../shared/monty';
export function WorkspaceNav({
  state,
  area,
  folderId,
  settings,
  home,
  onHome,
  onArea,
  onFolder,
  onSettings,
}: {
  state: State;
  area: Area | null;
  folderId?: string | null;
  settings: boolean;
  home: boolean;
  onHome: () => void;
  onArea: (area: Area) => void;
  onFolder: (folder: Folder) => void;
  onSettings: () => void;
}) {
  const folders = Object.values(state.monty!.folders)
    .filter((f) => f.pinned)
    .slice(0, 5);
  return (
    <aside className="workspace-nav" aria-label="Workspace navigation">
      <button className="workspace-logo" aria-label="Monty home" onClick={onHome}>
        <span className="brand-mark">
          <NotebookPen size={25} />
        </span>
        <span>
          Monty<small>A space to grow.</small>
        </span>
      </button>
      <div className="workspace-nav-label">WORKSPACE</div>
      <nav aria-label="Study areas">
        <button
          aria-current={home && !settings ? 'page' : undefined}
          className={home && !settings ? 'selected' : ''}
          onClick={onHome}
        >
          <Home size={19} />
          Home
        </button>
        {(
          [
            ['grammar', 'Grammar', BookOpen],
            ['vocab', 'Vocabulary', Library],
            ['reading', 'Reading', BookOpen],
            ['maths', 'Mathematics', Calculator],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            className={area === key && !settings ? 'selected' : ''}
            aria-current={area === key && !settings ? 'page' : undefined}
            onClick={() => onArea(key)}
          >
            <Icon size={19} />
            {label}
            <ChevronRight size={14} className="nav-chevron" />
          </button>
        ))}
      </nav>
      {folders.length > 0 && (
        <>
          <div className="workspace-nav-label">PINNED TOPICS</div>
          <nav className="workspace-pinned" aria-label="Pinned topics">
            {folders.map((f) => (
              <button
                key={f.id}
                className={folderId === f.id && !settings ? 'selected' : ''}
                onClick={() => onFolder(f)}
              >
                <span className="topic-dot" />
                {f.name}
              </button>
            ))}
          </nav>
        </>
      )}
      <div className="workspace-nav-bottom">
        <div className="workspace-note">
          <Sparkles size={18} />
          <strong>One topic at a time.</strong>
          <p>A little practice today makes a difference tomorrow.</p>
        </div>
        <button
          className={settings ? 'workspace-settings selected' : 'workspace-settings'}
          onClick={onSettings}
        >
          <Settings size={19} />
          Settings
        </button>
      </div>
    </aside>
  );
}
