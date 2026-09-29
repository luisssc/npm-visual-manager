import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';

vi.mock('vscode', () => ({
  window: {
    withProgress: vi.fn(async (_options, task) => task()),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  ProgressLocation: { Notification: 15 },
  workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
}));
vi.mock('../../utils/commandRunner', () => ({ runCommand: vi.fn() }));
vi.mock('../../services/installedVersionService', () => ({
  getInstalledVersion: vi.fn(),
  getInstalledVersions: vi.fn(),
}));
vi.mock('../../services/auditService', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  clearAuditCache: vi.fn(),
  runAudit: vi.fn(),
  detectPackageManager: vi.fn().mockResolvedValue('npm'),
}));
vi.mock('../../services/packageService', () => ({
  findPackageJson: vi.fn(async projectPath => `${projectPath}/package.json`),
  readPackageJson: vi.fn().mockResolvedValue({ name: 'demo' }),
  extractDependencies: vi.fn(async () => [
    { name: 'demo', declaredVersion: '^1.0.0', installedVersion: '1.0.0', type: 'dependencies' },
  ]),
}));
vi.mock('../../services/nodeVersionService', () => ({ getVersions: vi.fn().mockResolvedValue({}) }));
vi.mock('fs', async importOriginal => ({
  ...(await importOriginal<typeof import('fs')>()),
  promises: { readFile: vi.fn().mockResolvedValue('{"dependencies":{"demo":"^2.0.0"}}'), writeFile: vi.fn() },
}));

import { NpmGuiManagerPanel } from '../webviewPanel';
import { getInstalledVersion } from '../../services/installedVersionService';
import { runCommand } from '../../utils/commandRunner';
import { PackageOperationsService } from '../../services/packageOperationsService';
import { runAudit } from '../../services/auditService';

const projectA = path.resolve('project-a');
const projectB = path.resolve('project-b');
const history = {
  projectPath: projectA,
  timestamp: 1,
  packages: [
    { name: 'demo', previousDeclaredVersion: '^1.0.0', previousInstalledVersion: '1.0.0', newVersion: '2.0.0' },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(runCommand).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  vi.mocked(getInstalledVersion).mockResolvedValue('1.0.0');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function makePanel() {
  const prototype = NpmGuiManagerPanel.prototype as any;
  vi.spyOn(prototype, '_initializeCache').mockResolvedValue(undefined);
  vi.spyOn(prototype, '_initFileWatcher').mockImplementation(() => {});
  vi.spyOn(prototype, '_update').mockImplementation(() => {});
  vi.spyOn(prototype, '_loadDependencies').mockResolvedValue(undefined);
  vi.spyOn(prototype, '_checkUpdates').mockResolvedValue(undefined);
  const panel = { webview: { onDidReceiveMessage: vi.fn(), postMessage: vi.fn() }, onDidDispose: vi.fn() };
  return new (NpmGuiManagerPanel as any)(panel, {}, {}, projectA, [
    { name: 'A', path: projectA, relativePath: '.' },
    { name: 'B', path: projectB, relativePath: 'b' },
  ]);
}

describe('project-bound rollback', () => {
  it('refuses a history from a different project before running any command', async () => {
    const send = vi.fn();
    const save = vi.fn();
    const service = new PackageOperationsService(send, vi.fn(), save);
    await service.rollbackLastUpdate(history, projectB, 'npm');
    expect(runCommand).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'ROLLBACK_RESULT', success: false }));
  });

  it('keeps A history with A when an update finishes after switching to B', async () => {
    const panel = makePanel();
    let finishVersion!: (version: string) => void;
    vi.mocked(getInstalledVersion).mockReturnValueOnce(
      new Promise(resolve => {
        finishVersion = resolve;
      })
    );
    const update = panel._handleMessage({
      type: 'UPDATE_PACKAGE',
      packageName: 'demo',
      version: '2.0.0',
      currentVersion: '^1.0.0',
    });
    await panel._selectProject(projectB);
    finishVersion('1.0.0');
    await vi.runAllTimersAsync();
    await update;
    vi.mocked(runCommand).mockClear();

    await panel._handleMessage({ type: 'ROLLBACK_LAST' });
    expect(runCommand).not.toHaveBeenCalled();
    await panel._selectProject(projectA);
    await panel._handleMessage({ type: 'ROLLBACK_LAST' });
    expect(runCommand).toHaveBeenCalledWith('npm install demo@1.0.0', expect.objectContaining({ cwd: projectA }));
    vi.mocked(runCommand).mockClear();
    await panel._handleMessage({ type: 'ROLLBACK_LAST' });
    expect(runCommand).not.toHaveBeenCalled();
  });
});

describe('audit status sent to the webview', () => {
  it('discards a project load that finishes after switching projects', async () => {
    const panel = makePanel();
    panel._loadDependencies.mockRestore();
    const clean = {
      vulnerabilities: [],
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, totalDependencies: 1 },
    };
    let finishAudit!: (result: typeof clean) => void;
    let auditStarted!: () => void;
    const started = new Promise<void>(resolve => {
      auditStarted = resolve;
    });
    vi.mocked(runAudit)
      .mockImplementationOnce(() => {
        auditStarted();
        return new Promise(resolve => {
          finishAudit = resolve;
        });
      })
      .mockResolvedValue(clean);
    const firstLoad = panel._loadDependencies();
    await started;
    await panel._selectProject(projectB);
    finishAudit(clean);
    await firstLoad;
    const messages = panel._panel.webview.postMessage.mock.calls.map((call: any[]) => call[0]);
    expect(messages).toHaveLength(1);
    expect(messages[0].currentProjectPath).toBe(projectB);
    expect(panel._checkUpdates).toHaveBeenCalledTimes(1);
  });

  it('sends unknown security on failure and valid clean data after retry', async () => {
    const panel = makePanel();
    panel._loadDependencies.mockRestore();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(runAudit)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        vulnerabilities: [],
        metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, totalDependencies: 1 },
      });
    const send = panel._panel.webview.postMessage;
    await panel._loadDependencies();
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ auditFailed: true }));
    expect(send.mock.lastCall[0].dependencies[0].hasVulnerabilities).toBeUndefined();

    await panel._loadDependencies();
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ auditFailed: false }));
    expect(send.mock.lastCall[0].dependencies[0].hasVulnerabilities).toBe(false);
  });
});
