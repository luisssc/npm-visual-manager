/**
 * Service for reading and manipulating the package.json
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PackageJson, Dependency } from '../../types';
import { getPackageSize } from './sizeService';
import { getInstalledVersion } from './installedVersionService';

interface ExtractDependenciesOptions {
  includeSize?: boolean;
  concurrency?: number;
}

/**
 * Find the package.json in the workspace
 */
export async function findPackageJson(workspacePath: string): Promise<string | null> {
  const packageJsonPath = path.join(workspacePath, 'package.json');

  try {
    await fs.promises.access(packageJsonPath, fs.constants.F_OK);
    return packageJsonPath;
  } catch {
    return null;
  }
}

/**
 * Read and parse the package.json
 */
export async function readPackageJson(packageJsonPath: string): Promise<PackageJson> {
  const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
  return JSON.parse(content) as PackageJson;
}

/**
 * Extract dependencies from the package.json
 */
export async function extractDependencies(
  packageJson: PackageJson,
  workspaceRoot?: string,
  options: ExtractDependenciesOptions = {}
): Promise<Dependency[]> {
  const includeSize = options.includeSize ?? true;
  const concurrency = Math.max(1, options.concurrency ?? 12);

  const depEntries: Array<{
    name: string;
    version: string;
    type: 'dependencies' | 'devDependencies' | 'peerDependencies';
  }> = [];

  const collectDeps = (deps: Record<string, string>, type: 'dependencies' | 'devDependencies' | 'peerDependencies') => {
    for (const [name, version] of Object.entries(deps)) {
      depEntries.push({ name, version, type });
    }
  };

  if (packageJson.dependencies) {
    collectDeps(packageJson.dependencies, 'dependencies');
  }

  if (packageJson.devDependencies) {
    collectDeps(packageJson.devDependencies, 'devDependencies');
  }

  if (packageJson.peerDependencies) {
    collectDeps(packageJson.peerDependencies, 'peerDependencies');
  }

  const dependencies = await mapWithConcurrency(depEntries, concurrency, async ({ name, version, type }) => {
    const installedVersionPromise = workspaceRoot
      ? getInstalledVersion(workspaceRoot, name).catch(() => null)
      : Promise.resolve<string | null>(null);

    const sizePromise =
      workspaceRoot && includeSize
        ? getPackageSize(workspaceRoot, name).catch(() => '-')
        : Promise.resolve<string | undefined>(undefined);

    const [installedVersion, size] = await Promise.all([installedVersionPromise, sizePromise]);

    return {
      name,
      declaredVersion: version, // ej: "^5"
      installedVersion: installedVersion || version, // ej: "5.9.3" o fallback a declarada
      type,
      size,
    };
  });

  return dependencies.sort((a, b) => a.name.localeCompare(b.name));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      results[index] = await mapper(items[index]!);
    }
  });

  await Promise.all(workers);
  return results;
}
