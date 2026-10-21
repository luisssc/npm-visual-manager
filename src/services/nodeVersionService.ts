/**
 * Service for getting Node.js and package manager versions
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { coerce, gt } from 'semver';
import type { PackageManager, VersionInfo } from '../../types';
import { resolveExecutable } from '../utils/resolveExecutable';

const execAsync = promisify(exec);
const LATEST_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 5 * 60 * 1000;

const latestCache = new Map<string, { at: number; version: string | null }>();

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
    const binaryPath = (await resolveExecutable(binaryName)) || binaryName;
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

/** Local versions stay instant. Registry and nodejs.org checks fill in afterwards. */
export async function withUpdateAvailability(manager: PackageManager, versions: VersionInfo): Promise<VersionInfo> {
  const [nodeLatestVersion, packageManagerLatestVersion] = await Promise.all([
    lookupLatestNode(versions.nodeVersion),
    lookupLatestPackageManager(manager),
  ]);
  return {
    ...versions,
    nodeLatestVersion: nodeLatestVersion ?? undefined,
    nodeUpdateAvailable: isNewerVersion(nodeLatestVersion, versions.nodeVersion),
    packageManagerLatestVersion: packageManagerLatestVersion ?? undefined,
    packageManagerUpdateAvailable: isNewerVersion(packageManagerLatestVersion, versions.packageManagerVersion),
  };
}

export function isNewerVersion(latest: string | null | undefined, current: string | null | undefined): boolean {
  if (!latest || !current || latest.includes('-')) {return false;}
  const next = coerce(latest);
  const now = coerce(current);
  if (!next || !now) {return false;}
  return gt(next, now);
}

export function nodeVersionFromDistUrl(url: string): string | null {
  const match = url.match(/\/v(\d+\.\d+\.\d+)\/?(?:[?#].*)?$/);
  return match?.[1] ?? null;
}

export function versionFromRegistryDocument(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('version' in payload)) {return null;}
  const version = (payload as { version: unknown }).version;
  if (typeof version !== 'string' || version.includes('-')) {return null;}
  return coerce(version)?.version ?? null;
}

async function lookupLatestNode(current: string): Promise<string | null> {
  const parsed = coerce(current);
  if (!parsed) {return null;}
  return cached(`node-${parsed.major}`, async () => {
    const response = await fetch(`https://nodejs.org/dist/latest-v${parsed.major}.x/`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    });
    const version = nodeVersionFromDistUrl(response.url);
    await response.body?.cancel().catch(() => undefined);
    return version;
  });
}

async function lookupLatestPackageManager(manager: PackageManager): Promise<string | null> {
  return cached(`pm-${manager}`, async () => {
    const response = await fetch(`https://registry.npmjs.org/${manager}/latest`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {return null;}
    return versionFromRegistryDocument(await response.json());
  });
}

async function cached(key: string, load: () => Promise<string | null>): Promise<string | null> {
  const hit = latestCache.get(key);
  if (hit && Date.now() - hit.at < (hit.version ? LATEST_TTL_MS : MISS_TTL_MS)) {return hit.version;}
  try {
    const version = await load();
    latestCache.set(key, { at: Date.now(), version });
    return version;
  } catch {
    latestCache.set(key, { at: Date.now(), version: null });
    return null;
  }
}
