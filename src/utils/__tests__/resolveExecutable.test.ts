import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

const mockState = {
  results: new Map<string, { stdout?: string; stderr?: string; error?: Error }>(),
  defaultResult: { error: new Error('not found'), stdout: '', stderr: '' },
};

vi.mock('../shellUtils', () => ({
  executeShellCommand: vi.fn(async (cmd: string, _timeout: number) => {
    const result = mockState.results.get(cmd) || mockState.defaultResult;
    if (result.error) {
      throw result.error;
    }
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import { resolveExecutable, resolveCommandPath, clearExecutableCache } from '../resolveExecutable';
import { executeShellCommand } from '../shellUtils';
import * as fs from 'fs';

function setShellResult(cmd: string, result: { stdout?: string; stderr?: string; error?: Error }): void {
  mockState.results.set(cmd, result);
}

function clearShellResults(): void {
  mockState.results.clear();
}

function n(name: string): string {
  return path.normalize(name);
}

describe('resolveExecutable', () => {
  beforeEach(() => {
    clearExecutableCache();
    clearShellResults();
    vi.clearAllMocks();
    process.env.SHELL = '/bin/bash';
    delete process.env.NVM_DIR;
  });

  it('resolves via login shell when which returns a path', async () => {
    setShellResult('/bin/bash -lc "which npm"', {
      stdout: '/home/testuser/.nvm/versions/node/v22.0.0/bin/npm\n',
    });

    const result = await resolveExecutable('npm');
    expect(result).toBe('/home/testuser/.nvm/versions/node/v22.0.0/bin/npm');
  });

  it('falls back to nvm directory search when shell and which fail', async () => {
    setShellResult('/bin/bash -lc "which npm"', { error: new Error('not found') });
    setShellResult('which npm', { error: new Error('not found') });

    vi.mocked(fs.existsSync).mockImplementation((p: unknown) => {
      const pathStr = n(String(p));
      if (pathStr === n(path.join('/home/testuser', '.nvm', 'versions', 'node'))) return true;
      if (pathStr === n(path.join('/home/testuser', '.nvm', 'versions', 'node', 'v20.0.0', 'bin', 'npm'))) return true;
      if (pathStr === n(path.join('/home/testuser', '.nvm', 'versions', 'node', 'v22.0.0', 'bin', 'npm'))) return true;
      return false;
    });

    vi.mocked(fs.readdirSync).mockImplementation((p: unknown) => {
      const pathStr = n(String(p));
      if (pathStr === n(path.join('/home/testuser', '.nvm', 'versions', 'node'))) return ['v20.0.0', 'v22.0.0'] as unknown[] as string[];
      return [] as unknown[] as string[];
    });

    const result = await resolveExecutable('npm');
    expect(result).toBe(path.normalize('/home/testuser/.nvm/versions/node/v22.0.0/bin/npm'));
  });

  it('uses nvm alias default when available', async () => {
    setShellResult('/bin/bash -lc "which npm"', { error: new Error('not found') });
    setShellResult('which npm', { error: new Error('not found') });

    vi.mocked(fs.existsSync).mockImplementation((p: unknown) => {
      const pathStr = n(String(p));
      if (pathStr === n(path.join('/home/testuser', '.nvm', 'alias', 'default'))) return true;
      if (pathStr === n(path.join('/home/testuser', '.nvm', 'versions', 'node', 'v18.0.0', 'bin', 'npm'))) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
      const pathStr = n(String(p));
      if (pathStr === n(path.join('/home/testuser', '.nvm', 'alias', 'default'))) return '18.0.0';
      return '';
    });

    const result = await resolveExecutable('npm');
    expect(result).toBe(path.normalize('/home/testuser/.nvm/versions/node/v18.0.0/bin/npm'));
  });

  it('returns null when nothing is found', async () => {
    setShellResult('/bin/bash -lc "which npm"', { error: new Error('not found') });
    setShellResult('which npm', { error: new Error('not found') });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await resolveExecutable('npm');
    expect(result).toBeNull();
  });

  it('caches successful results', async () => {
    setShellResult('/bin/bash -lc "which npm"', {
      stdout: '/usr/bin/npm\n',
    });

    const r1 = await resolveExecutable('npm');
    const r2 = await resolveExecutable('npm');
    expect(r1).toBe('/usr/bin/npm');
    expect(r2).toBe('/usr/bin/npm');
    expect(executeShellCommand).toHaveBeenCalledTimes(1);
  });

  it('skips login shell when SHELL is unsupported (e.g. fish)', async () => {
    process.env.SHELL = '/usr/bin/fish';
    setShellResult('which npm', { error: new Error('not found') });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await resolveExecutable('npm');
    expect(result).toBeNull();
    // fish is not supported, so bash -lc should not be called
    expect(mockState.results.has('/usr/bin/fish -lc "which npm"')).toBe(false);
  });

  it('handles missing SHELL env variable gracefully', async () => {
    delete process.env.SHELL;
    setShellResult('which npm', { error: new Error('not found') });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await resolveExecutable('npm');
    expect(result).toBeNull();
  });

  it('searches fnm directories when nvm is not present', async () => {
    setShellResult('/bin/bash -lc "which pnpm"', { error: new Error('not found') });
    setShellResult('which pnpm', { error: new Error('not found') });

    vi.mocked(fs.existsSync).mockImplementation((p: unknown) => {
      const pathStr = n(String(p));
      if (pathStr === n(path.join('/home/testuser', '.fnm', 'node-versions'))) return true;
      if (pathStr === n(path.join('/home/testuser', '.fnm', 'node-versions', 'v20.0.0', 'installation', 'bin', 'pnpm'))) return true;
      return false;
    });

    vi.mocked(fs.readdirSync).mockImplementation((p: unknown) => {
      const pathStr = n(String(p));
      if (pathStr === n(path.join('/home/testuser', '.fnm', 'node-versions'))) return ['v20.0.0'] as unknown[] as string[];
      return [] as unknown[] as string[];
    });

    const result = await resolveExecutable('pnpm');
    expect(result).toBe(path.normalize('/home/testuser/.fnm/node-versions/v20.0.0/installation/bin/pnpm'));
  });

  it('searches volta and asdf shims', async () => {
    setShellResult('/bin/bash -lc "which bun"', { error: new Error('not found') });
    setShellResult('which bun', { error: new Error('not found') });

    vi.mocked(fs.existsSync).mockImplementation((p: unknown) => {
      const pathStr = n(String(p));
      if (pathStr === n(path.join('/home/testuser', '.volta', 'bin', 'bun'))) return true;
      return false;
    });

    const result = await resolveExecutable('bun');
    expect(result).toBe(path.normalize('/home/testuser/.volta/bin/bun'));
  });

  it('ignores "not found" text inside stdout from which', async () => {
    setShellResult('/bin/bash -lc "which npm"', {
      stdout: 'npm not found anywhere\n',
    });
    setShellResult('which npm', { error: new Error('not found') });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await resolveExecutable('npm');
    expect(result).toBeNull();
  });
});

describe('resolveCommandPath', () => {
  beforeEach(() => {
    clearExecutableCache();
    clearShellResults();
    vi.clearAllMocks();
    process.env.SHELL = '/bin/bash';
  });

  it('replaces npm with resolved absolute path', async () => {
    setShellResult('/bin/bash -lc "which npm"', { stdout: '/usr/bin/npm\n' });

    const result = await resolveCommandPath('npm install foo');
    expect(result).toBe('/usr/bin/npm install foo');
  });

  it('leaves unknown commands untouched', async () => {
    const result = await resolveCommandPath('git clone foo');
    expect(result).toBe('git clone foo');
  });

  it('leaves command unchanged when binary is not found', async () => {
    setShellResult('/bin/bash -lc "which pnpm"', { error: new Error('not found') });
    setShellResult('which pnpm', { error: new Error('not found') });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await resolveCommandPath('pnpm install foo');
    expect(result).toBe('pnpm install foo');
  });

  it('only replaces the first token', async () => {
    setShellResult('/bin/bash -lc "which npm"', { stdout: '/usr/bin/npm\n' });

    const result = await resolveCommandPath('npm run build --env=production');
    expect(result).toBe('/usr/bin/npm run build --env=production');
  });

  it('handles commands with leading spaces', async () => {
    setShellResult('/bin/bash -lc "which npm"', { stdout: '/usr/bin/npm\n' });

    const result = await resolveCommandPath('  npm install foo');
    // regex in resolveCommandPath expects command at start
    expect(result).toBe('  npm install foo');
  });
});
