/**
 * Service for getting Node.js and package manager versions
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { PackageManager } from '../../types';
import { resolveExecutable } from '../utils/resolveExecutable';

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
    const nodePath = (await resolveExecutable('node')) || 'node';
    const { stdout } = await execAsync(`${nodePath} --version`, { timeout: 5000 });
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
    let binaryName: string;
    switch (manager) {
      case 'npm':
        binaryName = 'npm';
        break;
      case 'yarn':
        binaryName = 'yarn';
        break;
      case 'pnpm':
        binaryName = 'pnpm';
        break;
      case 'bun':
        binaryName = 'bun';
        break;
      default:
        return 'unknown';
    }
    const binaryPath = await resolveExecutable(binaryName);
    if (!binaryPath) {
      return 'unknown';
    }
    const { stdout } = await execAsync(`${binaryPath} --version`, { timeout: 5000 });
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
