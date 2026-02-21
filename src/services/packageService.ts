/**
 * Servicio para leer y manipular el package.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { PackageJson, Dependency } from '../core/types';
import { getPackageSize } from './sizeService';
import { getInstalledVersion } from './installedVersionService';

/**
 * Busca el package.json en el workspace
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
 * Lee y parsea el package.json
 */
export async function readPackageJson(packageJsonPath: string): Promise<PackageJson> {
  const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
  return JSON.parse(content) as PackageJson;
}

/**
 * Extrae las dependencias del package.json
 */
export async function extractDependencies(
  packageJson: PackageJson, 
  workspaceRoot?: string
): Promise<Dependency[]> {
  const dependencies: Dependency[] = [];

  const extractDeps = async (
    deps: Record<string, string>, 
    type: 'dependencies' | 'devDependencies' | 'peerDependencies'
  ) => {
    for (const [name, version] of Object.entries(deps)) {
      let installedVersion: string | null = null;
      
      if (workspaceRoot) {
        try {
          installedVersion = await getInstalledVersion(workspaceRoot, name);
        } catch {
          // Ignore errors - will use declared version as fallback
        }
      }
      
      dependencies.push({
        name,
        declaredVersion: version,                       // ej: "^5"
        installedVersion: installedVersion || version,  // ej: "5.9.3" o fallback a declarada
        type,
        size: workspaceRoot ? getPackageSize(workspaceRoot, name) : undefined
      });
    }
  };

  if (packageJson.dependencies) {
    await extractDeps(packageJson.dependencies, 'dependencies');
  }

  if (packageJson.devDependencies) {
    await extractDeps(packageJson.devDependencies, 'devDependencies');
  }

  if (packageJson.peerDependencies) {
    await extractDeps(packageJson.peerDependencies, 'peerDependencies');
  }

  return dependencies.sort((a, b) => a.name.localeCompare(b.name));
}
