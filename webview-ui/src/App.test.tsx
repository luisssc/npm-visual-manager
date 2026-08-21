import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import App from './App';
import { I18nProvider } from './i18n/I18nContext';
import type { HostToWebviewMessage, ProjectInfo } from '../../types';

/**
 * Regression tests for issue #8: with several package.json files in one repo,
 * the panel must say which one it is acting on.
 */
const postMessage = vi.fn();

const THEME: ProjectInfo = {
  name: 'build',
  path: 'C:/repo/wp-content/themes/mytheme',
  relativePath: 'wp-content\\themes\\mytheme',
};

const PLUGIN: ProjectInfo = {
  name: 'build',
  path: 'C:/repo/wp-content/plugins/plugin-a',
  relativePath: 'wp-content\\plugins\\plugin-a',
};

function sendFromHost(message: HostToWebviewMessage): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: message }));
  });
}

function loadProjects(projects: ProjectInfo[], currentProjectPath: string): void {
  sendFromHost({
    type: 'DEPENDENCIES_DATA',
    dependencies: [
      {
        name: 'react',
        declaredVersion: '^18.0.0',
        installedVersion: '18.0.0',
        type: 'dependencies',
      },
    ],
    packageName: 'build',
    columnConfig: { size: true, type: false, lastUpdate: true, security: true, semverUpdate: true },
    projects,
    currentProjectPath,
  });
}

const Wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  window.acquireVsCodeApi = vi.fn(() => ({
    postMessage,
    getState: vi.fn(),
    setState: vi.fn(),
  }));
});

describe('App header target file', () => {
  it('names the package.json being managed, with forward slashes', () => {
    render(<App />, { wrapper: Wrapper });
    loadProjects([THEME, PLUGIN], THEME.path);

    expect(screen.getByText('wp-content/themes/mytheme/package.json')).toBeInTheDocument();
  });

  it('distinguishes projects that share the same package.json name', () => {
    render(<App />, { wrapper: Wrapper });
    loadProjects([THEME, PLUGIN], THEME.path);

    const options = screen.getAllByRole('option').map(option => option.textContent);
    expect(options).toEqual([
      'build — wp-content/themes/mytheme',
      'build — wp-content/plugins/plugin-a',
    ]);
  });

  it('shows the root package.json for a single-project workspace', () => {
    render(<App />, { wrapper: Wrapper });
    loadProjects([{ name: 'my-app', path: 'C:/repo', relativePath: '.' }], 'C:/repo');

    expect(screen.getByText('package.json')).toBeInTheDocument();
  });

  it('asks the host to open the target package.json when the chip is clicked', () => {
    render(<App />, { wrapper: Wrapper });
    loadProjects([THEME, PLUGIN], PLUGIN.path);

    fireEvent.click(screen.getByText('wp-content/plugins/plugin-a/package.json'));

    expect(postMessage).toHaveBeenCalledWith({ type: 'OPEN_PACKAGE_JSON', path: PLUGIN.path });
  });

  it('states the target file in the update confirmation', () => {
    const { container } = render(<App />, { wrapper: Wrapper });
    loadProjects([THEME, PLUGIN], THEME.path);

    // Rows without a pending update are hidden until "Show All Packages" is on.
    fireEvent.click(container.querySelector('.toggle-packages-btn')!);
    // The uninstall confirmation carries the same note as the update ones and
    // needs no registry round trip to appear.
    fireEvent.click(screen.getByTitle(/uninstall this package/i));

    const notes = screen.getAllByText('wp-content/themes/mytheme/package.json');
    expect(notes.length).toBeGreaterThan(1);
  });
});
