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
import * as fs from 'fs';
import * as path from 'path';
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
  /**
   * True when the dependency tree could not be resolved because the project's
   * dependencies are not installed here (e.g. a shared library whose deps live
   * in the consumer, or a subproject before `npm install`). The chains are
   * empty not because nothing depends on the package, but because there is no
   * installed tree to analyze.
   */
  notInstalled?: boolean;
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
  name?: string;
  version?: string;
  dependencies?: Record<string, DependencyTreeNode>;
  devDependencies?: Record<string, DependencyTreeNode>;
}

/** pnpm 10+ `why --json` node: bottom-up, each package lists who depends on it. */
interface PnpmDependent {
  name?: string;
  version?: string;
  depField?: string;
  dependents?: PnpmDependent[];
}

function label(name: string | undefined, version: string | undefined): string {
  return name && version ? `${name}@${version}` : name || '';
}

/**
 * When `npm ls` / `pnpm why` is run from a workspace subproject, the reported
 * tree is rooted at the monorepo root, with the current subproject appearing
 * as a child node. Anchor to that subproject node so its direct dependencies
 * are reported as direct (chain length 1) instead of prefixed by the
 * subproject name. Falls back to the root node when there is no match.
 */
function resolveProjectNode(root: DependencyTreeNode, projectName?: string): DependencyTreeNode {
  if (projectName && root.name !== projectName && root.dependencies) {
    const node = root.dependencies[projectName];
    if (node) {
      return node;
    }
  }
  return root;
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
export function parseNpmLsOutput(output: string, target: string, projectName?: string): string[][] {
  const data = JSON.parse(output) as DependencyTreeNode;
  const start = resolveProjectNode(data, projectName);
  const chains: string[][] = [];
  walkTree(start.dependencies, [], target, chains);
  // If anchoring to the subproject found nothing, the dependency may be hoisted
  // at the workspace root — retry from the root as a fallback.
  if (chains.length === 0 && start !== data) {
    walkTree(data.dependencies, [], target, chains);
  }
  return dedupeChains(chains);
}

/**
 * Walk a pnpm 10+ bottom-up `dependents` tree, building top-down chains
 * (direct dependency -> ... -> target). `acc` accumulates labels from the
 * target upward; the project root (a dependent with no further dependents)
 * is not included in the chain.
 */
function walkPnpmDependents(node: PnpmDependent, acc: string[], chains: string[][]): void {
  if (acc.length >= MAX_DEPTH || chains.length >= MAX_CHAINS) {
    return;
  }
  const deps = node.dependents;
  if (!deps || deps.length === 0) {
    // Reached the project root; the chain is what we accumulated, reversed.
    if (acc.length > 0) {
      chains.push([...acc].reverse());
    }
    return;
  }
  for (const dep of deps) {
    if (chains.length >= MAX_CHAINS) {
      return;
    }
    const depIsProjectRoot = !dep.dependents || dep.dependents.length === 0;
    if (depIsProjectRoot) {
      // `node` is a direct dependency of the project; close the chain.
      chains.push([...acc].reverse());
    } else {
      walkPnpmDependents(dep, [...acc, label(dep.name, dep.version)], chains);
    }
  }
}

/**
 * Parse `pnpm why <pkg> --json` output. Supports two formats:
 *  - pnpm <=9: top-down, an array of projects with nested `dependencies`
 *    trees (same node shape as npm ls).
 *  - pnpm >=10: bottom-up, an array where each entry is the queried package
 *    with a `dependents` array describing who depends on it.
 */
export function parsePnpmWhyOutput(output: string, target: string): string[][] {
  const data = JSON.parse(output) as unknown;
  const entries = Array.isArray(data) ? data : [data];
  const chains: string[][] = [];
  for (const entry of entries) {
    const node = entry as DependencyTreeNode & PnpmDependent;
    if (Array.isArray(node.dependents)) {
      // pnpm 10+ bottom-up format
      walkPnpmDependents(node, [label(node.name, node.version)], chains);
    } else {
      // pnpm <=9 top-down format
      walkTree(node.dependencies, [], target, chains);
      walkTree(node.devDependencies, [], target, chains);
    }
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

function parseWhyOutput(
  manager: PackageManager,
  output: string,
  target: string,
  projectName?: string
): string[][] {
  switch (manager) {
    case 'npm':
      return parseNpmLsOutput(output, target, projectName);
    case 'pnpm':
      return parsePnpmWhyOutput(output, target);
    case 'yarn':
      return parseYarnWhyOutput(output, target);
    case 'bun':
      return [];
  }
}

/**
 * Whether the project has an installed dependency tree on disk. This is the
 * source of truth for the "not installed" case: if node_modules exists with
 * content, dependencies are installed and an empty chain result means "nothing
 * depends on it" (or a parse gap), never "not installed". Basing this on the
 * filesystem avoids false positives from package-manager output format changes.
 */
async function hasInstalledModules(projectPath: string): Promise<boolean> {
  try {
    const entries = await fs.promises.readdir(path.join(projectPath, 'node_modules'));
    // A lone .package-lock.json or empty dir doesn't count as installed.
    return entries.some(name => name !== '.package-lock.json');
  } catch {
    return false;
  }
}

/**
 * Read the project's own name and whether it declares any dependencies.
 * Used to anchor workspace trees and to detect the "not installed" case.
 */
async function readProjectInfo(projectPath: string): Promise<{ name?: string; hasDeclaredDeps: boolean }> {
  try {
    const content = await fs.promises.readFile(path.join(projectPath, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const hasDeclaredDeps =
      Object.keys(pkg.dependencies ?? {}).length > 0 ||
      Object.keys(pkg.devDependencies ?? {}).length > 0 ||
      Object.keys(pkg.peerDependencies ?? {}).length > 0;
    return { name: pkg.name, hasDeclaredDeps };
  } catch {
    return { hasDeclaredDeps: false };
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

  const { name: projectName, hasDeclaredDeps } = await readProjectInfo(projectPath);
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

  const chains = parseWhyOutput(manager, stdout, packageName, projectName);

  // No chains + declared deps + no installed node_modules => dependencies are
  // not installed in this project (shared library, or install not run here).
  // Checked against the filesystem so a parser gap for a given package-manager
  // output format can never masquerade as "not installed".
  if (chains.length === 0 && hasDeclaredDeps && !(await hasInstalledModules(projectPath))) {
    return { chains: [], notInstalled: true };
  }

  return { chains };
}
