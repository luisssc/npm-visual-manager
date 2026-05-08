/**
 * Resolves the absolute path of an executable binary.
 * Handles cases where the executable is not in the current process PATH
 * (e.g. when installed via nvm, fnm, or volta and VS Code was not launched
 * from an interactive shell).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { executeShellCommand } from './shellUtils';

const CACHE = new Map<string, string | null>();

/**
 * Resolve the absolute path of an executable.
 * Results are cached in memory for the duration of the session.
 */
export async function resolveExecutable(name: string): Promise<string | null> {
  if (CACHE.has(name)) {
    return CACHE.get(name)!;
  }

  const resolved = await tryResolve(name);
  CACHE.set(name, resolved);
  return resolved;
}

async function tryResolve(name: string): Promise<string | null> {
  // 1. Try using the user's login shell to find the executable.
  //    This loads .bashrc/.zshrc where nvm/fnm are typically initialised.
  const userShell = process.env.SHELL;
  if (userShell) {
    const shellName = path.basename(userShell);
    const isSupported = shellName === 'bash' || shellName === 'zsh' || shellName === 'sh';
    if (isSupported) {
      try {
        const { stdout } = await executeShellCommand(`${userShell} -lc "which ${name}"`, 5000);
        const found = stdout.trim();
        if (found && !found.toLowerCase().includes('not found')) {
          return found;
        }
      } catch {
        // Fall through to manual search
      }
    }
  }

  // 2. Try a plain which command (may work in some containers)
  try {
    const { stdout } = await executeShellCommand(`which ${name}`, 5000);
    const found = stdout.trim();
    if (found && !found.toLowerCase().includes('not found')) {
      return found;
    }
  } catch {
    // Fall through to manual search
  }

  // 3. Search common installation directories
  const home = os.homedir();
  const candidates: string[] = [];

  // nvm – use the default alias or the latest installed version
  try {
    const nvmDir = process.env.NVM_DIR || path.join(home, '.nvm');
    const aliasDefault = path.join(nvmDir, 'alias', 'default');
    if (fs.existsSync(aliasDefault)) {
      const defaultVersion = fs.readFileSync(aliasDefault, 'utf-8').trim();
      if (defaultVersion) {
        candidates.push(path.join(nvmDir, 'versions', 'node', `v${defaultVersion.replace(/^v/, '')}`, 'bin', name));
      }
    }

    const versionsDir = path.join(nvmDir, 'versions', 'node');
    if (fs.existsSync(versionsDir)) {
      const versions = fs.readdirSync(versionsDir)
        .filter(v => fs.existsSync(path.join(versionsDir, v, 'bin', name)))
        .sort((a, b) => compareSemverDesc(a, b));
      for (const v of versions) {
        candidates.push(path.join(versionsDir, v, 'bin', name));
      }
    }
  } catch {
    // ignore
  }

  // fnm
  try {
    const fnmDirs = [
      path.join(home, '.fnm', 'node-versions'),
      path.join(home, '.local', 'share', 'fnm', 'node-versions'),
    ];
    for (const fnmDir of fnmDirs) {
      if (fs.existsSync(fnmDir)) {
        const versions = fs.readdirSync(fnmDir)
          .filter(v => fs.existsSync(path.join(fnmDir, v, 'installation', 'bin', name)))
          .sort((a, b) => compareSemverDesc(a, b));
        for (const v of versions) {
          candidates.push(path.join(fnmDir, v, 'installation', 'bin', name));
        }
      }
    }
  } catch {
    // ignore
  }

  // volta
  candidates.push(path.join(home, '.volta', 'bin', name));

  // asdf
  candidates.push(path.join(home, '.asdf', 'shims', name));

  // system paths
  candidates.push(
    path.join('/usr', 'local', 'bin', name),
    path.join('/usr', 'bin', name),
    path.join('/opt', 'local', 'bin', name),
    path.join(home, '.local', 'bin', name),
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) {
      return nb - na;
    }
  }
  return 0;
}

/**
 * Replace the first token of a command with its resolved absolute path.
 * Only replaces common package-manager / node binaries.
 */
export async function resolveCommandPath(command: string): Promise<string> {
  const match = command.match(/^(\S+)(.*)$/);
  if (!match) {
    return command;
  }

  const firstToken = match[1]!;
  const rest = match[2]!;

  const resolvableCommands = ['npm', 'yarn', 'pnpm', 'bun', 'node'];
  if (!resolvableCommands.includes(firstToken)) {
    return command;
  }

  const resolved = await resolveExecutable(firstToken);
  if (resolved) {
    return `${resolved}${rest}`;
  }

  return command;
}

/**
 * Clear the in-memory cache. Mainly useful for testing.
 */
export function clearExecutableCache(): void {
  CACHE.clear();
}
