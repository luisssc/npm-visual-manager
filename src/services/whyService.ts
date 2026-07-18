/**
 * Service that answers "why is this package installed?" by asking the
 * project's package manager for the reverse dependency chains.
 *
 * Output is normalized to chains: each chain is the path from a direct
 * dependency down to the target package (e.g. ['react-scripts@5.0.1',
 * 'webpack@5.88.0', 'loader-utils@2.0.4']). A chain with a single entry
 * means the package is a direct dependency.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { PackageManager } from '../../types';
import { resolveCommandPath } from '../utils/resolveExecutable';

const execAsync = promisify(exec);

const MAX_CHAINS = 50;
const MAX_DEPTH = 20;
const COMMAND_TIMEOUT_MS = 30000;
const MAX_BUFFER = 50 * 1024 * 1024; // npm ls --all can be large on big trees

export interface WhyResult {
  chains: string[][];
  /** True when the package manager has no supported "why" command (bun) */
  unsupported?: boolean;
}

/** Valid npm package name (also guards against shell injection in exec) */
const PACKAGE_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

export function isValidPackageName(packageName: string): boolean {
  return PACKAGE_NAME_REGEX.test(packageName) && packageName.length <= 214;
}

export function getWhyCommand(manager: PackageManager, packageName: string): string | null {
  switch (manager) {
    case 'npm':
      return `npm ls ${packageName} --all --json`;
    case 'yarn':
      return `yarn why ${packageName} --json`;
    case 'pnpm':
      return `pnpm why ${packageName} --json`;
    case 'bun':
      return null;
  }
}

interface DependencyTreeNode {
  version?: string;
  dependencies?: Record<string, DependencyTreeNode>;
  devDependencies?: Record<string, DependencyTreeNode>;
}

function walkTree(
  deps: Record<string, DependencyTreeNode> | undefined,
  currentPath: string[],
  target: string,
  chains: string[][]
): void {
  if (!deps || currentPath.length >= MAX_DEPTH || chains.length >= MAX_CHAINS) {
    return;
  }

  for (const [name, node] of Object.entries(deps)) {
    if (chains.length >= MAX_CHAINS) {
      return;
    }
    const label = node.version ? `${name}@${node.version}` : name;
    const nextPath = [...currentPath, label];
    if (name === target) {
      chains.push(nextPath);
      // The target's own dependencies cannot lead back to it
      continue;
    }
    walkTree(node.dependencies, nextPath, target, chains);
    walkTree(node.devDependencies, nextPath, target, chains);
  }
}

function dedupeChains(chains: string[][]): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const chain of chains) {
    const key = chain.join(' > ');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(chain);
    }
  }
  return result;
}

/**
 * Parse `npm ls <pkg> --all --json` output.
 * Shape: { name, version, dependencies: { <name>: { version, dependencies: {...} } } }
 * npm prunes the tree to paths that lead to the requested package.
 */
export function parseNpmLsOutput(output: string, target: string): string[][] {
  const data = JSON.parse(output) as DependencyTreeNode;
  const chains: string[][] = [];
  walkTree(data.dependencies, [], target, chains);
  return dedupeChains(chains);
}

/**
 * Parse `pnpm why <pkg> --json` output.
 * Shape: an array of projects, each with dependencies/devDependencies trees
 * (same nested node shape as npm ls).
 */
export function parsePnpmWhyOutput(output: string, target: string): string[][] {
  const data = JSON.parse(output) as DependencyTreeNode[] | DependencyTreeNode;
  const projects = Array.isArray(data) ? data : [data];
  const chains: string[][] = [];
  for (const project of projects) {
    walkTree(project.dependencies, [], target, chains);
    walkTree(project.devDependencies, [], target, chains);
  }
  return dedupeChains(chains);
}

/**
 * Parse `yarn why <pkg> --json` (yarn classic) NDJSON output.
 * Reasons appear as info/list entries with patterns like:
 *   - 'Specified in "dependencies"'            -> direct dependency
 *   - '"a#b" depends on it'                    -> chain a > b > target
 *   - 'Hoisted from "a#b#<target>"'            -> chain a > b > target
 * Yarn does not include versions in these paths.
 */
export function parseYarnWhyOutput(output: string, target: string): string[][] {
  const chains: string[][] = [];

  const addReason = (reason: string): void => {
    const specifiedMatch = reason.match(/^Specified in "(.+)"$/);
    if (specifiedMatch) {
      chains.push([target]);
      return;
    }

    const dependsMatch = reason.match(/^"(.+)" depends on it$/);
    if (dependsMatch) {
      const segments = dependsMatch[1]!.split('#').filter(s => s !== '_project');
      chains.push([...segments, target]);
      return;
    }

    const hoistedMatch = reason.match(/^Hoisted from "(.+)"$/);
    if (hoistedMatch) {
      const segments = hoistedMatch[1]!.split('#').filter(s => s !== '_project');
      // Last segment is the target itself
      if (segments.length > 0) {
        segments[segments.length - 1] = target;
        chains.push(segments);
      }
    }
  };

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let entry: { type?: string; data?: unknown };
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (entry.type === 'info' && typeof entry.data === 'string') {
      addReason(entry.data.replace(/^=>\s*/, ''));
    } else if (entry.type === 'list') {
      const listData = entry.data as { type?: string; items?: unknown[] } | undefined;
      if (listData?.type === 'reasons' && Array.isArray(listData.items)) {
        for (const item of listData.items) {
          if (typeof item === 'string') {
            addReason(item);
          }
        }
      }
    }
  }

  return dedupeChains(chains).slice(0, MAX_CHAINS);
}

function parseWhyOutput(manager: PackageManager, output: string, target: string): string[][] {
  switch (manager) {
    case 'npm':
      return parseNpmLsOutput(output, target);
    case 'pnpm':
      return parsePnpmWhyOutput(output, target);
    case 'yarn':
      return parseYarnWhyOutput(output, target);
    case 'bun':
      return [];
  }
}

/**
 * Run the package manager's "why" command and return normalized chains.
 */
export async function getWhyInstalled(
  projectPath: string,
  manager: PackageManager,
  packageName: string
): Promise<WhyResult> {
  if (!isValidPackageName(packageName)) {
    throw new Error(`Invalid package name: ${packageName}`);
  }

  const command = getWhyCommand(manager, packageName);
  if (!command) {
    return { chains: [], unsupported: true };
  }

  const resolvedCommand = await resolveCommandPath(command);

  let stdout: string;
  try {
    const result = await execAsync(resolvedCommand, {
      cwd: projectPath,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    stdout = result.stdout;
  } catch (error) {
    // npm ls exits with code 1 for warnings (extraneous, invalid) but still
    // prints the full JSON tree — same pattern as npm audit
    if (error instanceof Error && 'stdout' in error && (error as { stdout: string }).stdout) {
      stdout = (error as { stdout: string }).stdout;
    } else {
      throw error;
    }
  }

  return { chains: parseWhyOutput(manager, stdout, packageName) };
}
