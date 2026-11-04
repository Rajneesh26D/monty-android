import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppHeader } from '../src/components/AppHeader';
import { WorkspaceNav } from '../src/components/WorkspaceNav';
import { WorkspaceNavigationProvider } from '../src/components/WorkspaceNavigation';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';

vi.mock('../src/services/appearance', () => ({
  useAppearance: () => ({ mode: 'dark', color: 'violet' }),
  setAppearance: vi.fn(),
}));

function renderNavigation() {
  const state = upgradeState(emptyState());
  const folder = Object.values(state.monty!.folders)[0];
  folder.pinned = true;
  return renderToStaticMarkup(
    createElement(WorkspaceNavigationProvider, {
      children: [
        createElement(AppHeader, { key: 'header', title: 'Grammar / Revision' }),
        createElement(WorkspaceNav, {
          key: 'navigation',
          state,
          area: 'grammar',
          folderId: null,
          settings: false,
          home: false,
          onHome: vi.fn(),
          onArea: vi.fn(),
          onFolder: vi.fn(),
          onSettings: vi.fn(),
        }),
      ],
    }),
  );
}

it('renders one compact menu trigger without duplicate Home or Settings actions in the header', () => {
  const html = renderNavigation();
  const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)![0];
  expect(header).toContain('aria-label="Open navigation"');
  expect(header).toContain('aria-expanded="false"');
  expect(header).toContain('aria-controls="workspace-navigation"');
  expect(header).toContain('Grammar / Revision');
  expect(header).not.toContain('home-button');
  expect(header).not.toContain('aria-label="Monty home"');
  expect(header).not.toContain('aria-label="Settings"');
  expect(header).not.toContain('Your learning workspace');
});

it('starts with the drawer closed and supplies keyboard-accessible close and destination controls', () => {
  const html = renderNavigation();
  const dialog = html.match(/<dialog\b[^>]*>/)![0];
  expect(dialog).toContain('id="workspace-navigation"');
  expect(dialog).not.toMatch(/\sopen(?:\s|=|>)/);
  expect(html).toContain('aria-label="Close navigation"');
  expect(html).toContain('aria-label="Study areas"');
  expect(html).toContain('aria-label="Pinned topics"');
  expect(html.match(/Home<\/button>/g)).toHaveLength(1);
  for (const destination of ['Grammar', 'Vocabulary', 'Reading', 'Mathematics', 'Settings'])
    expect(html).toContain(destination);
  expect(html).not.toContain('One topic at a time.');
});
