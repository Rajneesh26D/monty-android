import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { useWorkspaceNavigation } from './WorkspaceNavigation';
import { CloudStatus } from './CloudStatus';
import { BookOpen, Calculator, ChevronRight, Home, Library, Settings, X } from 'lucide-react';
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
  nativeBackHandled = false,
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
  nativeBackHandled?: boolean;
}) {
  const navigation = useWorkspaceNavigation();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (navigation.open) {
      setClosing(false);
      if (!element.open) {
        opener.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        element.showModal();
      }
      return;
    }
    if (!element.open) return;
    setClosing(true);
    const timer = setTimeout(() => {
      element.close();
      setClosing(false);
      if (opener.current?.isConnected) opener.current.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [navigation.open]);
  useEffect(() => {
    if (!navigation.open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [navigation.open]);
  useEffect(() => {
    if (!navigation.open || nativeBackHandled || !Capacitor.isNativePlatform()) return;
    let disposed = false;
    let remove: (() => void) | undefined;
    void NativeApp.addListener('backButton', navigation.closeMenu).then((listener) => {
      if (disposed) void listener.remove();
      else
        remove = () => {
          void listener.remove();
        };
    });
    return () => {
      disposed = true;
      remove?.();
    };
  }, [navigation.open, nativeBackHandled, navigation.closeMenu]);
  const navigate = (action: () => void) => {
    void navigation
      .navigate(action)
      .then(() =>
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('.navigation-toggle')?.focus(),
        ),
      );
  };
  const folders = Object.values(state.monty!.folders)
    .filter((f) => f.pinned)
    .slice(0, 5);
  const contents = (
    <dialog
      ref={dialog}
      id="workspace-navigation"
      className={'workspace-drawer' + (closing ? ' is-closing' : '')}
      aria-labelledby="workspace-navigation-title"
      onCancel={(event) => {
        event.preventDefault();
        navigation.closeMenu();
      }}
      onClose={navigation.closeMenu}
      onClick={(event) => {
        if (event.target === event.currentTarget) navigation.closeMenu();
      }}
    >
      <aside className="workspace-nav" aria-label="Workspace navigation">
        <div className="workspace-drawer-heading">
          <h2 id="workspace-navigation-title">Menu</h2>
          <button
            className="icon-button"
            aria-label="Close navigation"
            onClick={navigation.closeMenu}
          >
            <X size={22} />
          </button>
        </div>
        {navigation.hasActiveAttempt && (
          <p className="drawer-attempt-note">
            Your test is paused and saved. Resume it when you return.
          </p>
        )}
        {navigation.error && (
          <p className="notice danger" role="alert">
            {navigation.error}
          </p>
        )}
        <div className="workspace-nav-label">WORKSPACE</div>
        <nav aria-label="Study areas">
          <button
            aria-current={home && !settings ? 'page' : undefined}
            className={home && !settings ? 'selected' : ''}
            onClick={() => navigate(onHome)}
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
              onClick={() => navigate(() => onArea(key))}
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
                  onClick={() => navigate(() => onFolder(f))}
                >
                  <span className="topic-dot" />
                  {f.name}
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="workspace-nav-bottom">
          <CloudStatus />
          <button
            className={settings ? 'workspace-settings selected' : 'workspace-settings'}
            onClick={() => navigate(onSettings)}
          >
            <Settings size={19} />
            Settings
          </button>
        </div>
      </aside>
    </dialog>
  );
  return typeof document === 'undefined' ? contents : createPortal(contents, document.body);
}
