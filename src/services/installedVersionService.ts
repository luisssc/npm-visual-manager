/**
 * Service to get exact installed version from node_modules
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Get the exact installed version from node_modules/package.json
 */
export async function getInstalledVersion(projectPath: string, packageName: string): Promise<string | null> {
  try {
    const packageJsonPath = path.join(projectPath, 'node_modules', packageName, 'package.json');

    const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    return pkg.version || null;
  } catch {
    return null;
  }
}

/**
 * Get installed versions for multiple packages
 */
export async function getInstalledVersions(projectPath: string, packageNames: string[]): Promise<Map<string, string>> {
  const versions = new Map<string, string>();

  await Promise.all(
    packageNames.map(async name => {
      const version = await getInstalledVersion(projectPath, name);
      if (version) {
        versions.set(name, version);
      }
    })
  );

  return versions;
}
