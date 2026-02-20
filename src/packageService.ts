/**
 * Servicio para leer y manipular el package.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { PackageJson, Dependency } from './types';

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
export function extractDependencies(packageJson: PackageJson): Dependency[] {
  const dependencies: Dependency[] = [];

  if (packageJson.dependencies) {
    for (const [name, version] of Object.entries(packageJson.dependencies)) {
      dependencies.push({
        name,
        installedVersion: version,
        type: 'dependencies'
      });
    }
  }

  if (packageJson.devDependencies) {
    for (const [name, version] of Object.entries(packageJson.devDependencies)) {
      dependencies.push({
        name,
        installedVersion: version,
        type: 'devDependencies'
      });
    }
  }

  if (packageJson.peerDependencies) {
    for (const [name, version] of Object.entries(packageJson.peerDependencies)) {
      dependencies.push({
        name,
        installedVersion: version,
        type: 'peerDependencies'
      });
    }
  }

  return dependencies.sort((a, b) => a.name.localeCompare(b.name));
}
