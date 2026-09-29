import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import App from './App';
import { I18nProvider } from './i18n/I18nContext';
import type { HostToWebviewMessage, ProjectInfo, UpdateHistory } from '../../types';

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

function loadProjects(
  projects: ProjectInfo[],
  currentProjectPath: string,
  extra: Partial<Extract<HostToWebviewMessage, { type: 'DEPENDENCIES_DATA' }>> = {}
): void {
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
    ...extra,
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

afterEach(() => vi.useRealTimers());

describe('package operation locking', () => {
  const dependencies = [{
    name: 'react', declaredVersion: '^18.0.0', installedVersion: '18.0.0',
    type: 'dependencies' as const, updateAvailable: true, latestVersion: '19.0.0',
  }];
  const history: UpdateHistory = {
    projectPath: THEME.path, timestamp: 1,
    packages: [{ name: 'react', previousDeclaredVersion: '^17.0.0', previousInstalledVersion: '17.0.0', newVersion: '18.0.0' }],
  };

  it('keeps every write action locked beyond three seconds and through dependency reloads until completion', () => {
    vi.useFakeTimers();
    const { container } = render(<App />, { wrapper: Wrapper });
    loadProjects([THEME, PLUGIN], THEME.path, { dependencies, lastUpdate: history });
    fireEvent.click(container.querySelector('.update-btn')!);
    sendFromHost({ type: 'PACKAGE_VERSIONS_RESULT', packageName: 'react', versions: [] });
    fireEvent.click(container.querySelector('.modal-btn.confirm')!);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'UPDATE_PACKAGE', packageName: 'react' }));
    expect(container.querySelector('.update-btn')).toBeDisabled();
    act(() => vi.advanceTimersByTime(10000));
    expect(container.querySelector('.update-btn')).toBeDisabled();
    expect(container.querySelector('.update-all-btn')).toBeDisabled();
    expect(container.querySelector('.uninstall-btn')).toBeDisabled();
    expect(container.querySelector('.rollback-btn')).toBeDisabled();
    loadProjects([THEME, PLUGIN], THEME.path, { dependencies, pendingOperations: 1 });
    expect(container.querySelector('.update-btn')).toBeDisabled();
    sendFromHost({ type: 'UPDATE_RESULT', projectPath: THEME.path, packageName: 'react', success: true, message: 'done' });
    sendFromHost({ type: 'PACKAGE_OPERATIONS_STATE', projectPath: THEME.path, pending: 0 });
    expect(container.querySelector('.update-btn')).toBeEnabled();
    expect(container.querySelector('.uninstall-btn')).toBeEnabled();
  });

  it('keeps queued writes locked after the first result and releases after a failure drains the queue', () => {
    const { container } = render(<App />, { wrapper: Wrapper });
    loadProjects([THEME], THEME.path, { dependencies, pendingOperations: 2 });
    sendFromHost({ type: 'UPDATE_RESULT', projectPath: THEME.path, packageName: 'react', success: true, message: 'done' });
    sendFromHost({ type: 'PACKAGE_OPERATIONS_STATE', projectPath: THEME.path, pending: 1 });
    expect(container.querySelector('.update-btn')).toBeDisabled();
    sendFromHost({ type: 'INSTALL_RESULT', projectPath: THEME.path, packageName: 'other', success: false, message: 'failed' });
    sendFromHost({ type: 'PACKAGE_OPERATIONS_STATE', projectPath: THEME.path, pending: 0 });
    expect(container.querySelector('.update-btn')).toBeEnabled();
  });

  it('does not unlock project B when an operation from project A completes', () => {
    const { container } = render(<App />, { wrapper: Wrapper });
    loadProjects([THEME, PLUGIN], THEME.path, { dependencies, pendingOperations: 1 });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: PLUGIN.path } });
    loadProjects([THEME, PLUGIN], PLUGIN.path, { dependencies, pendingOperations: 1 });
    postMessage.mockClear();
    sendFromHost({ type: 'UPDATE_RESULT', projectPath: THEME.path, packageName: 'react', success: true, message: 'done' });
    sendFromHost({ type: 'PACKAGE_OPERATIONS_STATE', projectPath: THEME.path, pending: 0 });
    expect(postMessage).not.toHaveBeenCalled();
    expect(container.querySelector('.update-btn')).toBeDisabled();
    sendFromHost({ type: 'PACKAGE_OPERATIONS_STATE', projectPath: PLUGIN.path, pending: 0 });
    expect(container.querySelector('.update-btn')).toBeEnabled();
  });

  it.each(['bulk', 'uninstall', 'rollback', 'install'])('locks immediately when submitting %s', action => {
    const { container } = render(<App />, { wrapper: Wrapper });
    loadProjects([THEME], THEME.path, { dependencies, lastUpdate: history });
    if (action === 'install') {
      fireEvent.click(container.querySelector('.search-toggle-btn')!);
      sendFromHost({ type: 'SEARCH_RESULTS', results: [{ name: 'other', version: '1.0.0', description: '', date: '' }] });
      fireEvent.click(container.querySelector('.search-result-item')!);
      fireEvent.click(container.querySelector('.install-btn')!);
    } else {
      const selector = action === 'bulk' ? '.update-all-btn' : action === 'uninstall' ? '.uninstall-btn' : '.rollback-btn';
      fireEvent.click(container.querySelector(selector)!);
      fireEvent.click(container.querySelector('.modal-btn.confirm')!);
    }
    expect(container.querySelector('.update-btn')).toBeDisabled();
    expect(container.querySelector('.app')).toHaveAttribute('aria-busy', 'true');
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: { bulk: 'UPDATE_ALL_PACKAGES', uninstall: 'UNINSTALL_PACKAGE', rollback: 'ROLLBACK_LAST', install: 'INSTALL_NEW_PACKAGE' }[action],
    }));
  });

  it.each(['other', 'react'])('disables search install/uninstall for %s while an update is running', name => {
    const { container } = render(<App />, { wrapper: Wrapper });
    loadProjects([THEME], THEME.path, { dependencies });
    fireEvent.click(container.querySelector('.search-toggle-btn')!);
    sendFromHost({ type: 'SEARCH_RESULTS', results: [{ name, version: '1.0.0', description: '', date: '' }] });
    fireEvent.click(container.querySelector('.search-result-item')!);
    if (name === 'react') fireEvent.click(container.querySelector('.search-uninstall-btn')!);
    sendFromHost({ type: 'PACKAGE_OPERATIONS_STATE', projectPath: THEME.path, pending: 1 });
    const button = container.querySelector(name === 'react' ? '.search-uninstall-btn' : '.install-btn')!;
    expect(button).toBeDisabled();
    postMessage.mockClear();
    fireEvent.click(button);
    expect(postMessage).not.toHaveBeenCalled();
    sendFromHost({ type: 'PACKAGE_OPERATIONS_STATE', projectPath: THEME.path, pending: 0 });
    expect(button).toBeEnabled();
  });
});

describe('security audit status', () => {
  it('shows failed audits as unknown, supports retry, and clears the warning after success', () => {
    const { container } = render(<App />, { wrapper: Wrapper });
    loadProjects([THEME], THEME.path, { auditFailed: true });
    fireEvent.click(container.querySelector('.toggle-packages-btn')!);

    expect(screen.getByRole('alert')).toHaveTextContent('Security audit unavailable');
    expect(container.querySelector('.status-safe')).toBeNull();
    expect(screen.getByLabelText(/Security audit unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'REFRESH_CACHE' });

    loadProjects([THEME], THEME.path, {
      auditFailed: false,
      dependencies: [{ name: 'react', declaredVersion: '^18.0.0', installedVersion: '18.0.0', type: 'dependencies', hasVulnerabilities: false }],
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('.status-safe')).not.toBeNull();
  });

  it('does not mark missing audit information as safe', () => {
    const { container } = render(<App />, { wrapper: Wrapper });
    loadProjects([THEME], THEME.path);
    fireEvent.click(container.querySelector('.toggle-packages-btn')!);
    expect(container.querySelector('.status-safe')).toBeNull();
  });
});

describe('rollback results across projects', () => {
  it('does not clear B history when an earlier rollback of A completes', () => {
    render(<App />, { wrapper: Wrapper });
    const history: UpdateHistory = {
      projectPath: PLUGIN.path,
      timestamp: 1,
      packages: [{ name: 'react', previousDeclaredVersion: '^17.0.0', previousInstalledVersion: '17.0.0', newVersion: '18.0.0' }],
    };
    loadProjects([THEME, PLUGIN], PLUGIN.path, { lastUpdate: history });
    sendFromHost({ type: 'ROLLBACK_RESULT', projectPath: THEME.path, success: true, message: 'A rolled back' });
    expect(screen.getByRole('button', { name: /Rollback/ })).toBeInTheDocument();
    expect(screen.queryByText('A rolled back')).not.toBeInTheDocument();

    sendFromHost({ type: 'ROLLBACK_RESULT', projectPath: PLUGIN.path, success: true, message: 'B rolled back' });
    expect(screen.queryByRole('button', { name: /Rollback/ })).not.toBeInTheDocument();
  });
});

describe('App header target file', () => {
  it('links a private dependency to its configured registry', () => {
    render(<App />, { wrapper: Wrapper });
    loadProjects([THEME], THEME.path, {
      dependencies: [{
        name: '@company/demo', declaredVersion: '^1.0.0', installedVersion: '1.0.0',
        type: 'dependencies', updateAvailable: true, latestVersion: '2.0.0',
        registryUrl: 'https://gitlab.example.test/api/v4/projects/42/packages/npm/',
        packageUrl: 'https://gitlab.example.test/api/v4/projects/42/packages/npm/%40company%2Fdemo',
      }],
    });
    expect(screen.getByRole('link', { name: '@company/demo' })).toHaveAttribute('href', 'https://gitlab.example.test/api/v4/projects/42/packages/npm/%40company%2Fdemo');
  });

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
