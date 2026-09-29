/**
 * Service to get exact installed version from node_modules
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Read the nearest installed manifest, including hoisted dependencies and pnpm links.
 * Read it directly so package exports and missing runtime entry points do not hide it.
 */
export async function getInstalledVersion(projectPath: string, packageName: string): Promise<string | null> {
  if (!/^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/i.test(packageName)) return null;
  let directory = path.resolve(projectPath);
  try { directory = await fs.promises.realpath(directory); } catch { /* New project. */ }
  for (;;) {
    if (path.basename(directory) !== 'node_modules') {
      const packageDirectory = path.join(directory, 'node_modules', packageName);
      let installed = false;
      try {
        installed = (await fs.promises.stat(packageDirectory)).isDirectory();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
      }
      if (installed) {
        // A broken local manifest must not be replaced by an unrelated parent version.
        try {
          const pkg = JSON.parse(await fs.promises.readFile(path.join(packageDirectory, 'package.json'), 'utf8'));
          return typeof pkg?.version === 'string' && pkg.version.trim() ? pkg.version : null;
        } catch {
          return null;
        }
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
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
