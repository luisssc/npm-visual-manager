import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const channel = vi.hoisted(() => ({
  show: vi.fn(),
  append: vi.fn(),
  appendLine: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('vscode', () => ({ window: { createOutputChannel: () => channel } }));

import { runCommand, disposeOutputChannel } from '../commandRunner';
import { clearExecutableCache } from '../resolveExecutable';

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  clearExecutableCache();
  disposeOutputChannel();
  vi.clearAllMocks();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== 'win32')('native Windows command runner', () => {
  function fixture(): { cwd: string; executable: string } {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-manager-'));
    directories.push(directory);
    const bin = path.join(directory, 'Program Files', 'nodejs');
    const cwd = path.join(directory, 'project with spaces');
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(cwd);
    const executable = path.join(bin, 'npm.cmd');
    fs.writeFileSync(executable, '@echo off\r\necho cwd=%CD%\r\necho args=%*\r\necho diagnostic 1>&2\r\nexit /b 7\r\n');
    vi.stubEnv('PATH', `${bin};${process.env.PATH ?? ''}`);
    vi.stubEnv('SHELL', 'C:/Program Files/Git/bin/bash.exe');
    return { cwd, executable };
  }

  it.each(['install', 'uninstall'])(
    'resolves npm on PATH containing spaces for %s and propagates output/exit status',
    async operation => {
      const { cwd } = fixture();
      const result = await runCommand(`npm ${operation} @types/react@19.0.0 react@19.0.0`, { cwd, showOutput: false });
      expect(result.exitCode).toBe(7);
      expect(result.stdout).toContain(`cwd=${cwd}`);
      expect(result.stdout).toContain(`args=${operation} @types/react@19.0.0 react@19.0.0`);
      expect(result.stderr).toContain('diagnostic');
      expect(channel.appendLine).toHaveBeenCalledWith(`  $ npm.cmd ${operation} @types/react@19.0.0 react@19.0.0`);
      expect(channel.show).not.toHaveBeenCalled();
    }
  );

  it('executes a quoted absolute wrapper path with spaces', async () => {
    const { cwd, executable } = fixture();
    const result = await runCommand(`"${executable}" install "package with spaces"`, { cwd });
    expect(result.exitCode).toBe(7);
    expect(result.stdout).toContain('args=install "package with spaces"');
  });

  it('reports a missing package manager as failure', async () => {
    const { cwd } = fixture();
    const result = await runCommand('npm-visual-manager-missing-command', { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it('rejects process launch errors', async () => {
    const { cwd } = fixture();
    await expect(runCommand('npm --version', { cwd: path.join(cwd, 'missing') })).rejects.toThrow();
  });
});
