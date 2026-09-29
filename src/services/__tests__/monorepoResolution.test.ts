import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectPackageManager, getAuditCommandForProject, resolvePackageManagerContext } from '../packageManagerService';
import { getInstalledVersion, getInstalledVersions } from '../installedVersionService';
import { extractDependencies } from '../packageService';

let root: string;
let project: string;
function write(relative: string, value: unknown = '') {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-vm-monorepo-'));
  project = path.join(root, 'packages', 'app');
  write('package.json', { private: true, workspaces: ['packages/*'] });
  write('packages/app/package.json', { name: 'app', dependencies: { demo: '^1.0.0' } });
});
afterEach(() => {
  const target = path.resolve(root);
  if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('npm-vm-monorepo-')) {
    throw new Error('Unexpected temporary directory');
  }
  fs.rmSync(target, { recursive: true, force: true });
});

describe('monorepo package manager detection', () => {
  it.each([
    ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'], ['package-lock.json', 'npm'], ['npm-shrinkwrap.json', 'npm'],
  ])('inherits %s from the root', async (lock, manager) => {
    write(lock);
    expect(await detectPackageManager(project)).toBe(manager);
    expect((await resolvePackageManagerContext(project)).rootPath).toBe(root);
  });

  it.each(['pnpm@10.0.0', 'yarn@4.0.0', 'bun@1.2.0', 'npm@11.0.0'])(
    'honors root packageManager %s before the first install', async packageManager => {
      write('package.json', { packageManager, workspaces: ['packages/*'] });
      expect(await detectPackageManager(project)).toBe(packageManager.split('@')[0]);
    }
  );

  it('prefers an explicit packageManager over conflicting lockfiles in the same directory', async () => {
    write('package.json', { packageManager: 'pnpm@10.0.0+sha512.example', workspaces: ['packages/*'] });
    write('package-lock.json');
    expect(await detectPackageManager(project)).toBe('pnpm');
  });

  it('detects a pnpm workspace before a lockfile exists', async () => {
    write('package.json', { private: true });
    write('pnpm-workspace.yaml', 'packages: [packages/*]');
    expect(await detectPackageManager(project)).toBe('pnpm');
  });

  it.each(['manifest', 'lockfile'])('keeps a nested independent project’s own %s', async source => {
    write('pnpm-lock.yaml');
    if (source === 'manifest') write('packages/app/package.json', { packageManager: 'yarn@1.22.22' });
    else write('packages/app/yarn.lock');
    expect(await detectPackageManager(project)).toBe('yarn');
  });

  it.each(['.git directory', '.git file'])('does not inherit the manager from outside a repository (%s)', async kind => {
    write('pnpm-lock.yaml');
    if (kind === '.git directory') fs.mkdirSync(path.join(project, '.git'));
    else write('packages/app/.git', 'gitdir: /some/worktree');
    expect(await detectPackageManager(project)).toBe('npm');
  });

  it('ignores malformed or unsupported packageManager values and uses the root lockfile', async () => {
    write('packages/app/package.json', { packageManager: { name: 'bun' } });
    write('package.json', { packageManager: 'unsupported@1.0.0' });
    write('pnpm-lock.yaml');
    expect(await detectPackageManager(project)).toBe('pnpm');
    write('packages/app/package.json', '{broken json');
    expect(await detectPackageManager(project)).toBe('pnpm');
  });

  it.each(['lockfile', 'manifest', 'config'])('uses the Berry audit command from root %s', async source => {
    if (source === 'lockfile') write('yarn.lock', '__metadata:\n  version: 8\n');
    if (source === 'manifest') write('package.json', { packageManager: 'yarn@4.5.0', workspaces: ['packages/*'] });
    if (source === 'config') write('.yarnrc.yml', 'nodeLinker: node-modules');
    expect(await detectPackageManager(project)).toBe('yarn');
    expect(await getAuditCommandForProject('yarn', project)).toBe('yarn npm audit --json');
  });
});

describe('installed versions from ancestor node_modules', () => {
  it('reports the exact hoisted version in dependency data for the selected subproject', async () => {
    write('node_modules/demo/package.json', { version: '1.2.3' });
    const dependencies = await extractDependencies({ name: 'app', dependencies: { demo: '^1.0.0' } }, project, { includeSize: false });
    expect(dependencies).toEqual([expect.objectContaining({ name: 'demo', declaredVersion: '^1.0.0', installedVersion: '1.2.3' })]);
  });

  it('finds a hoisted dependency without requiring a runtime entry point or exported package.json', async () => {
    write('node_modules/demo/package.json', { name: 'demo', version: '1.2.3', exports: { '.': './missing.js' } });
    expect(await getInstalledVersion(project, 'demo')).toBe('1.2.3');
  });

  it('prefers the nearest installed version and supports scoped dependencies', async () => {
    write('node_modules/@company/demo/package.json', { version: '1.0.0' });
    write('packages/node_modules/@company/demo/package.json', { version: '2.0.0' });
    expect(await getInstalledVersion(project, '@company/demo')).toBe('2.0.0');
    write('packages/app/node_modules/@company/demo/package.json', { version: '3.0.0' });
    expect(await getInstalledVersion(project, '@company/demo')).toBe('3.0.0');
  });

  it('follows pnpm-style package links and workspace links', async () => {
    write('node_modules/.pnpm/demo@1.2.3/node_modules/demo/package.json', { version: '1.2.3' });
    fs.symlinkSync(path.join(root, 'node_modules/.pnpm/demo@1.2.3/node_modules/demo'), path.join(root, 'node_modules/demo'), 'junction');
    write('packages/lib/package.json', { name: '@company/lib', version: '2.3.4' });
    fs.mkdirSync(path.join(root, 'node_modules/@company'));
    fs.symlinkSync(path.join(root, 'packages/lib'), path.join(root, 'node_modules/@company/lib'), 'junction');
    expect(await getInstalledVersions(project, ['demo', '@company/lib', 'missing'])).toEqual(new Map([
      ['demo', '1.2.3'], ['@company/lib', '2.3.4'],
    ]));
  });

  it.each(['{broken', { version: 123 }, {}])('does not substitute an ancestor version when the local manifest is invalid: %j', async manifest => {
    write('node_modules/demo/package.json', { version: '1.0.0' });
    write('packages/app/node_modules/demo/package.json', manifest);
    expect(await getInstalledVersion(project, 'demo')).toBeNull();
  });

  it('does not read package versions from traversal paths', async () => {
    write('packages/app/package.json', { version: '9.9.9' });
    fs.mkdirSync(path.join(project, 'node_modules'));
    expect(await getInstalledVersion(project, '..')).toBeNull();
    expect(await getInstalledVersion(project, '../')).toBeNull();
  });
});
