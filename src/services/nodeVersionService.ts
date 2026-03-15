/**
 * Service for getting Node.js and package manager versions
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { PackageManager } from './packageManagerService';

const execAsync = promisify(exec);

export interface VersionInfo {
  nodeVersion: string;
  packageManagerVersion: string;
}

/**
 * Get Node.js version
 */
export async function getNodeVersion(): Promise<string> {
  try {
    const { stdout } = await execAsync('node --version', { timeout: 5000 });
    return stdout.trim().replace(/^v/, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Get package manager version
 */
export async function getPackageManagerVersion(manager: PackageManager): Promise<string> {
  try {
    let command: string;
    switch (manager) {
      case 'npm':
        command = 'npm --version';
        break;
      case 'yarn':
        command = 'yarn --version';
        break;
      case 'pnpm':
        command = 'pnpm --version';
        break;
      case 'bun':
        command = 'bun --version';
        break;
      default:
        return 'unknown';
    }
    const { stdout } = await execAsync(command, { timeout: 5000 });
    return stdout.trim().replace(/^v/, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Get both versions
 */
export async function getVersions(manager: PackageManager): Promise<VersionInfo> {
  const [nodeVersion, packageManagerVersion] = await Promise.all([getNodeVersion(), getPackageManagerVersion(manager)]);

  return {
    nodeVersion,
    packageManagerVersion,
  };
}
