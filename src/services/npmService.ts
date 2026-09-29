/**
 * Service for interacting with the NPM registry
 * With offline cache support
 */

import { getRegistryClient, RegistryError, RegistryTarget } from './registryService';
import type { PackageVersion } from '../../types';
import { getCache, VersionCache } from './cacheService';

export interface NpmPackageInfo {
  name: string;
  'dist-tags': {
    latest: string;
    [tag: string]: string;
  };
  versions: Record<string, unknown>;
  time?: {
    created: string;
    modified: string;
    [version: string]: string;
  };
}

export interface PackageDetails {
  latestVersion: string;
  lastPublishDate?: string;
  fromCache?: boolean;
  cacheAge?: number;
  isDeprecated?: boolean;
  deprecationMessage?: string;
  repositoryUrl?: string;
  registryUrl?: string;
  packageUrl?: string;
}

export type SemverUpdateType = 'major' | 'minor' | 'patch' | 'none' | 'unknown';

interface PackageContext {
  target: RegistryTarget;
  cache: VersionCache;
  key: string;
}

async function packageContext(packageName: string, projectPath: string): Promise<PackageContext> {
  const target = (await getRegistryClient(projectPath)).forPackage(packageName);
  return { target, cache: getCache(projectPath), key: target.url + '|' + packageName };
}

async function fetchPackageInfo(packageName: string, context: PackageContext): Promise<NpmPackageInfo> {
  const info = await context.target.json<NpmPackageInfo>(encodeURIComponent(packageName));
  if (!info || typeof info['dist-tags']?.latest !== 'string' || !info.versions || Array.isArray(info.versions)) {
    throw new RegistryError('The configured registry returned invalid package metadata.');
  }
  const details = detailsFromInfo(info);
  context.cache.set(context.key, details);
  return info;
}

function detailsFromInfo(info: NpmPackageInfo): PackageDetails {
  const latestVersion = info['dist-tags'].latest;
  const version = info.versions[latestVersion] as
    | { deprecated?: string; repository?: { url?: string } | string }
    | undefined;
  return {
    latestVersion,
    lastPublishDate: info.time?.[latestVersion] || info.time?.modified,
    isDeprecated: !!version?.deprecated,
    deprecationMessage: version?.deprecated,
    repositoryUrl: extractRepositoryUrl(version?.repository),
  };
}

/** Get package metadata using the selected project's npm configuration. */
export async function getPackageInfo(
  packageName: string,
  forceRefresh: boolean = false,
  projectPath: string = process.cwd()
): Promise<NpmPackageInfo> {
  const context = await packageContext(packageName, projectPath);
  const cached = !forceRefresh && context.cache.get(context.key);
  if (cached) {
    return {
      name: packageName,
      'dist-tags': { latest: cached.latestVersion },
      versions: {},
      time: cached.lastPublishDate
        ? {
            created: cached.lastPublishDate,
            modified: cached.lastPublishDate,
            [cached.latestVersion]: cached.lastPublishDate,
          }
        : undefined,
    };
  }
  return fetchPackageInfo(packageName, context);
}

export async function getPackageDetails(
  packageName: string,
  forceRefresh: boolean = false,
  projectPath: string = process.cwd()
): Promise<PackageDetails> {
  // Capture both the registry and cache before starting any asynchronous fetch.
  const context = await packageContext(packageName, projectPath);
  const source = { registryUrl: context.target.url, packageUrl: context.target.packageUrl(packageName) };
  const cached = !forceRefresh && context.cache.get(context.key);
  if (cached) {
    return { ...cached, ...source, fromCache: true, cacheAge: context.cache.getAgeHours(context.key) ?? 0 };
  }
  try {
    const info = await fetchPackageInfo(packageName, context);
    return { ...detailsFromInfo(info), ...source, fromCache: false };
  } catch (error) {
    // Authentication and missing packages need attention, not stale success.
    if (error instanceof RegistryError && [401, 403, 404].includes(error.statusCode ?? 0)) {
      throw error;
    }
    const stale = context.cache.getStale(context.key);
    if (stale) {
      return { ...stale, ...source, fromCache: true, cacheAge: context.cache.getAgeHours(context.key) ?? 999 };
    }
    throw error;
  }
}

/**
 * Get the latest version of a package
 */
export async function getLatestVersion(
  packageName: string,
  forceRefresh: boolean = false,
  projectPath: string = process.cwd()
): Promise<string> {
  const details = await getPackageDetails(packageName, forceRefresh, projectPath);
  return details.latestVersion;
}

/**
 * Get all available versions of a package from NPM registry
 * Returns versions sorted from newest to oldest
 */
export async function getPackageVersions(
  packageName: string,
  limit: number = 20,
  projectPath: string = process.cwd()
): Promise<PackageVersion[]> {
  // Always fetch fresh data for version list (cache may not have full version list)
  const info = await getPackageInfo(packageName, true, projectPath);

  const versions: PackageVersion[] = [];

  // Get all versions; semantic version ordering does not require publication dates.
  const versionEntries = Object.entries(info.versions);

  // Build version info array
  for (const [version, versionData] of versionEntries) {
    // Skip deprecated versions unless it's the only one
    const data = versionData as { deprecated?: string };
    const date = info.time?.[version] || info.time?.modified || new Date().toISOString();

    // Detect if it's a pre-release version (contains -alpha, -beta, -rc, -dev, etc.)
    const isPrerelease = /-\w/.test(version);

    versions.push({
      version,
      date,
      isDeprecated: !!data.deprecated,
      deprecationMessage: data.deprecated,
      releaseType: isPrerelease ? 'prerelease' : 'stable',
    });
  }

  // Sort by semantic version descending (highest version first, e.g., 10.1.0, 10.0.3, 9.39.4)
  versions.sort((a, b) => compareVersions(b.version, a.version));

  // Split into stable and prerelease
  const stableVersions = versions.filter(v => v.releaseType === 'stable');
  const prereleaseVersions = versions.filter(v => v.releaseType === 'prerelease');

  // Always show at least 10 stable versions (if available) + prereleases up to the limit
  const stableLimit = Math.max(10, limit - Math.min(prereleaseVersions.length, 10));
  const selectedStables = stableVersions.slice(0, stableLimit);
  const selectedPrereleases = prereleaseVersions.slice(0, Math.max(0, limit - selectedStables.length));

  return [...selectedStables, ...selectedPrereleases];
}

/**
 * Extract clean repository URL from NPM package info
 */
function extractRepositoryUrl(repository?: { url?: string } | string): string | undefined {
  if (!repository) {
    return undefined;
  }

  const url = typeof repository === 'string' ? repository : repository.url;
  if (!url) {
    return undefined;
  }

  // Clean up git+ prefix and .git suffix
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^github:/, 'https://github.com/');
}

/**
 * Clean version string by removing prefixes like ^, ~, >=, etc.
 */
export function cleanVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, '');
}

/**
 * Compare two semver versions (simplified)
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = cleanVersion(v1);
  const clean2 = cleanVersion(v2);

  const parts1 = clean1.split('.').map(Number);
  const parts2 = clean2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 < p2) {
      return -1;
    }
    if (p1 > p2) {
      return 1;
    }
  }

  return 0;
}

/**
 * Check if an update is available
 */
export function isUpdateAvailable(installed: string, latest: string): boolean {
  return compareVersions(cleanVersion(installed), latest) < 0;
}

/**
 * Determine the semver update type (major, minor, patch)
 */
export function getSemverUpdateType(installed: string, latest: string): SemverUpdateType {
  const cleanInstalled = cleanVersion(installed);
  const cleanLatest = cleanVersion(latest);

  const installedParts = cleanInstalled.split('.').map(Number);
  const latestParts = cleanLatest.split('.').map(Number);

  const major1 = installedParts[0] || 0;
  const major2 = latestParts[0] || 0;
  const minor1 = installedParts[1] || 0;
  const minor2 = latestParts[1] || 0;
  const patch1 = installedParts[2] || 0;
  const patch2 = latestParts[2] || 0;

  if (major1 !== major2) {
    return major2 > major1 ? 'major' : 'unknown';
  }
  if (minor1 !== minor2) {
    return minor2 > minor1 ? 'minor' : 'unknown';
  }
  if (patch1 !== patch2) {
    return patch2 > patch1 ? 'patch' : 'unknown';
  }
  return 'none';
}
