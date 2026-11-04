import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { createWorkspaceNavigation } from '../core/workspaceNavigation';

const NavigationContext = createContext<ReturnType<typeof createWorkspaceNavigation> | null>(null);
const fallback = createWorkspaceNavigation();
export function WorkspaceNavigationProvider({ children }: { children: ReactNode }) {
  const [navigation] = useState(createWorkspaceNavigation);
  return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
}
export function useWorkspaceNavigation() {
  const navigation = useContext(NavigationContext) ?? fallback;
  const state = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  return { ...navigation, ...state };
}
export function NavigationToggle({
  className = 'icon-button navigation-toggle',
}: {
  className?: string;
}) {
  const navigation = useWorkspaceNavigation();
  return (
    <button
      className={className}
      aria-label={navigation.open ? 'Close navigation' : 'Open navigation'}
      aria-controls="workspace-navigation"
      aria-expanded={navigation.open}
      aria-haspopup="dialog"
      disabled={navigation.busy}
      onClick={() => (navigation.open ? navigation.closeMenu() : void navigation.openMenu())}
    >
      <Menu size={22} />
    </button>
  );
}
export function NavigationError() {
  const navigation = useWorkspaceNavigation();
  return navigation.error && !navigation.open ? (
    <div className="navigation-error" role="alert">
      <span>{navigation.error}</span>
      <button
        className="icon-button"
        aria-label="Dismiss navigation error"
        onClick={navigation.closeMenu}
      >
        <X size={18} />
      </button>
    </div>
  ) : null;
}
