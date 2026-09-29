import * as fs from 'fs';
import * as path from 'path';

// Shared across panels, including a panel reopened while a command is running.
const tails = new Map<string, Promise<void>>();
const pendingByProject = new Map<string, number>();
const listeners = new Set<(projectPath: string, pending: number) => void>();
const lockfiles = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];

function canonicalPath(projectPath: string): string {
  let resolved = path.resolve(projectPath);
  try { resolved = fs.realpathSync(resolved); } catch { /* A new project may not exist yet. */ }
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function queueKey(projectPath: string): string {
  let directory = canonicalPath(projectPath);
  let owner = directory;
  // Conservatively serialize descendants of a shared lockfile/workspace root.
  // Workspace declarations also cover the first install, before a lockfile exists.
  for (;;) {
    let workspace = false;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
      workspace = !!manifest.workspaces;
    } catch { /* No readable package.json at this ancestor. */ }
    if (workspace || fs.existsSync(path.join(directory, 'pnpm-workspace.yaml')) ||
        lockfiles.some(file => fs.existsSync(path.join(directory, file)))) {
      owner = directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) return owner;
    directory = parent;
  }
}

export function getPendingPackageOperations(projectPath: string): number {
  return pendingByProject.get(canonicalPath(projectPath)) ?? 0;
}

export function onPackageOperationsChanged(listener: (projectPath: string, pending: number) => void): { dispose(): void } {
  listeners.add(listener);
  return { dispose: () => { listeners.delete(listener); } };
}

function notify(projectPath: string, pending: number): void {
  for (const listener of listeners) {
    // A disposed view must never interrupt a command or poison the queue.
    try { listener(projectPath, pending); } catch { /* View is no longer available. */ }
  }
}

export function enqueuePackageOperation<T>(
  projectPath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const project = canonicalPath(projectPath);
  const key = queueKey(projectPath);
  const previous = tails.get(key);
  pendingByProject.set(project, (pendingByProject.get(project) ?? 0) + 1);
  notify(projectPath, pendingByProject.get(project)!);

  const result = (async () => {
    if (previous) await previous;
    return operation();
  })();
  // A failed command must not prevent subsequent operations from starting.
  const tail = result.then(() => {}, () => {});
  tails.set(key, tail);
  return result.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
    const remaining = (pendingByProject.get(project) ?? 1) - 1;
    if (remaining) pendingByProject.set(project, remaining);
    else pendingByProject.delete(project);
    notify(projectPath, remaining);
  });
}
