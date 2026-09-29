import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => ({
  window: {
    withProgress: vi.fn(async (_options, task) => task()),
    showErrorMessage: vi.fn(), showInformationMessage: vi.fn(),
  },
  ProgressLocation: { Notification: 15 },
}));
vi.mock('../../utils/commandRunner', () => ({ runCommand: vi.fn() }));
vi.mock('../auditService', () => ({ clearAuditCache: vi.fn() }));
vi.mock('../installedVersionService', () => ({
  getInstalledVersion: vi.fn().mockResolvedValue('1.0.0'),
  getInstalledVersions: vi.fn().mockResolvedValue(new Map([['demo', '1.0.0']])),
}));

import { enqueuePackageOperation, getPendingPackageOperations, onPackageOperationsChanged } from '../packageOperationQueue';
import { PackageOperationsService } from '../packageOperationsService';
import { runCommand } from '../../utils/commandRunner';
import { getInstalledVersion } from '../installedVersionService';
import type { UpdateHistory } from '../../../types';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let root: string;
const subscriptions: { dispose(): void }[] = [];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-operation-'));
  vi.useFakeTimers();
  vi.mocked(runCommand).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
});
afterEach(() => {
  subscriptions.splice(0).forEach(subscription => subscription.dispose());
  vi.useRealTimers();
  vi.clearAllMocks();
  const target = path.resolve(root);
  if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('npm-operation-')) {
    throw new Error('Unexpected temporary directory');
  }
  fs.rmSync(target, { recursive: true, force: true });
});

function project(name: string) {
  const directory = path.join(root, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ dependencies: { demo: '^1.0.0' } }));
  return directory;
}

describe('package operation queue', () => {
  it.each(['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'])(
    'serializes sibling projects sharing %s and releases after a rejection', async lockfile => {
      const a = project('a');
      const b = project('b');
      fs.writeFileSync(path.join(root, lockfile), '');
      const gate = deferred();
      const first = enqueuePackageOperation(a, () => gate.promise).catch(error => error.message);
      const next = vi.fn(async () => 'done');
      const second = enqueuePackageOperation(b, next);
      await vi.advanceTimersByTimeAsync(10000);
      expect(next).not.toHaveBeenCalled();
      expect(getPendingPackageOperations(b)).toBe(1);
      gate.reject(new Error('command failed'));
      expect(await first).toBe('command failed');
      expect(await second).toBe('done');
      expect(getPendingPackageOperations(a)).toBe(0);
      expect(getPendingPackageOperations(b)).toBe(0);
    }
  );

  it.each(['npm', 'pnpm'])('serializes the first install in a %s workspace before a lockfile exists', async manager => {
    const a = project('a');
    const b = project('b');
    if (manager === 'npm') fs.writeFileSync(path.join(root, 'package.json'), '{"workspaces":["a","b"]}');
    else fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: [a, b]');
    const gate = deferred();
    const first = enqueuePackageOperation(a, () => gate.promise);
    fs.writeFileSync(path.join(root, manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'), '');
    const next = vi.fn(async () => {});
    const second = enqueuePackageOperation(b, next);
    expect(next).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([first, second]);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows independent projects to run concurrently', async () => {
    const gate = deferred();
    const first = enqueuePackageOperation(project('a'), () => gate.promise);
    const next = vi.fn(async () => {});
    await enqueuePackageOperation(project('b'), next);
    expect(next).toHaveBeenCalledOnce();
    gate.resolve();
    await first;
  });

  it('publishes the final state to a view opened during an operation', async () => {
    const a = project('a');
    const gate = deferred();
    const first = enqueuePackageOperation(a, () => gate.promise);
    const listener = vi.fn();
    subscriptions.push(onPackageOperationsChanged(listener));
    expect(getPendingPackageOperations(a)).toBe(1);
    gate.resolve();
    await first;
    expect(listener).toHaveBeenCalledWith(a, 0);
  });
});

describe('all package writes use the queue', () => {
  it('serializes update, bulk update, install, uninstall and rollback across service instances', async () => {
    const a = project('a');
    const command = deferred<Awaited<ReturnType<typeof runCommand>>>();
    const reload = deferred();
    const send = vi.fn();
    let history: UpdateHistory | null = null;
    const save = (value: UpdateHistory | null) => { history = value; };
    const firstService = new PackageOperationsService(send, vi.fn().mockReturnValueOnce(reload.promise), save);
    const otherService = new PackageOperationsService(send, vi.fn().mockResolvedValue(undefined), save);
    vi.mocked(runCommand).mockReturnValueOnce(command.promise);
    const operations = [
      firstService.updatePackage('demo', '2.0.0', '^1.0.0', a, 'npm'),
      otherService.updateAllPackages([{ name: 'demo', version: '3.0.0', currentVersion: '^2.0.0' }], a, 'npm'),
      otherService.installNewPackage('other', '1.0.0', false, a, 'npm'),
      otherService.uninstallPackage('demo', a, 'npm'),
      otherService.rollbackLastUpdate(() => history, a, 'npm'),
    ];
    await vi.advanceTimersByTimeAsync(10000);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(getPendingPackageOperations(a)).toBe(5);
    command.resolve({ exitCode: 0, stdout: '', stderr: '' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(runCommand).toHaveBeenCalledTimes(1); // Reload/history work is also protected.
    reload.resolve();
    await vi.runAllTimersAsync();
    await Promise.all(operations);
    expect(vi.mocked(runCommand).mock.calls.map(call => call[1]?.label)).toEqual([
      'Update demo@2.0.0', 'Update 1 package(s)', 'Install other@1.0.0', 'Uninstall demo', 'Rollback 1 package(s)',
    ]);
    expect(getPendingPackageOperations(a)).toBe(0);
    expect(history).toBeNull();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'ROLLBACK_RESULT', projectPath: a, success: true }));
  });

  it.each(['preparation', 'command', 'exit code'])('unblocks subsequent writes after a %s failure', async failure => {
    const a = project('a');
    const send = vi.fn();
    const service = new PackageOperationsService(send, vi.fn().mockResolvedValue(undefined), vi.fn());
    if (failure === 'preparation') vi.mocked(getInstalledVersion).mockRejectedValueOnce(new Error('cannot read installed version'));
    if (failure === 'command') vi.mocked(runCommand).mockRejectedValueOnce(new Error('spawn failed'));
    if (failure === 'exit code') vi.mocked(runCommand).mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' });
    const first = service.updatePackage('demo', '2.0.0', '^1.0.0', a, 'npm');
    const second = service.installNewPackage('other', '1.0.0', false, a, 'npm');
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'UPDATE_RESULT', projectPath: a, success: false }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'INSTALL_RESULT', projectPath: a, success: true }));
    expect(getPendingPackageOperations(a)).toBe(0);
  });
});
