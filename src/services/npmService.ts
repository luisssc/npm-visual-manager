/**
 * Service for interacting with the NPM registry
 * With offline cache support
 */

import * as https from 'https';
import { VersionCache } from './cacheService';

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
}

export type SemverUpdateType = 'major' | 'minor' | 'patch' | 'none' | 'unknown';

// Global cache instance (set externally)
let globalCache: VersionCache | null = null;

export function setGlobalCache(cache: VersionCache): void {
  globalCache = cache;
}

/**
 * Get package information from the NPM registry
 * With cache support
 */
export async function getPackageInfo(packageName: string, forceRefresh: boolean = false): Promise<NpmPackageInfo> {
  // Check cache first if not forcing refresh
  if (!forceRefresh && globalCache) {
    const cached = globalCache.get(packageName);
    if (cached) {
      // Return cached data as mock NpmPackageInfo
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
  }

  return new Promise((resolve, reject) => {
    const encodedName = encodeURIComponent(packageName).replace('%40', '@');
    const url = `https://registry.npmjs.org/${encodedName}`;

    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'npm-visual-manager-vscode-extension',
        },
        timeout: 10000,
      },
      res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const packageInfo: NpmPackageInfo = JSON.parse(data);

              // Save to cache
              if (globalCache) {
                const latestVersion = packageInfo['dist-tags'].latest;
                const lastPublishDate = packageInfo.time?.[latestVersion] || packageInfo.time?.modified;

                // Check deprecation and repository for caching
                let isDeprecated = false;
                let deprecationMessage: string | undefined;
                const latestVersionInfo = packageInfo.versions[latestVersion] as
                  | { deprecated?: string; repository?: { url?: string } | string }
                  | undefined;
                if (latestVersionInfo?.deprecated) {
                  isDeprecated = true;
                  deprecationMessage = latestVersionInfo.deprecated;
                }
                const repositoryUrl = extractRepositoryUrl(latestVersionInfo?.repository);

                globalCache.set(packageName, {
                  latestVersion,
                  lastPublishDate,
                  isDeprecated,
                  deprecationMessage,
                  repositoryUrl,
                });
              }

              resolve(packageInfo);
            } else if (res.statusCode === 404) {
              reject(new Error(`Package "${packageName}" not found in npm registry`));
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse npm response: ${error}`));
          }
        });
      }
    );

    req.on('error', error => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout for package "${packageName}"`));
    });
  });
}

/**
 * Get package details (version and date)
 * With cache support
 */
export async function getPackageDetails(packageName: string, forceRefresh: boolean = false): Promise<PackageDetails> {
  // Check cache first
  if (!forceRefresh && globalCache) {
    const cached = globalCache.get(packageName);
    if (cached) {
      return {
        latestVersion: cached.latestVersion,
        lastPublishDate: cached.lastPublishDate,
        fromCache: true,
        cacheAge: globalCache.getAgeHours(packageName) || 0,
        isDeprecated: cached.isDeprecated,
        deprecationMessage: cached.deprecationMessage,
        repositoryUrl: cached.repositoryUrl,
      };
    }
  }

  try {
    const info = await getPackageInfo(packageName, forceRefresh);
    const latestVersion = info['dist-tags'].latest;

    // Get the publish date for the latest version
    let lastPublishDate: string | undefined;
    if (info.time && info.time[latestVersion]) {
      lastPublishDate = info.time[latestVersion];
    } else if (info.time?.modified) {
      lastPublishDate = info.time.modified;
    }

    // Check if package is deprecated
    // Note: In NPM, deprecation is per-version
    let isDeprecated = false;
    let deprecationMessage: string | undefined;

    // Check if latest version is deprecated
    const latestVersionInfo = info.versions[latestVersion] as
      | { deprecated?: string; repository?: { url?: string } | string }
      | undefined;
    if (latestVersionInfo?.deprecated) {
      isDeprecated = true;
      deprecationMessage = latestVersionInfo.deprecated;
    }

    // Extract repository URL for changelog
    const repositoryUrl = extractRepositoryUrl(latestVersionInfo?.repository);

    return {
      latestVersion,
      lastPublishDate,
      fromCache: false,
      isDeprecated,
      deprecationMessage,
      repositoryUrl,
    };
  } catch (error) {
    // If network fails, return stale cache as fallback for this package
    if (globalCache) {
      const staleEntry = globalCache.getStale(packageName);
      if (staleEntry) {
        return {
          latestVersion: staleEntry.latestVersion,
          lastPublishDate: staleEntry.lastPublishDate,
          fromCache: true,
          cacheAge: globalCache.getAgeHours(packageName) || 999,
          isDeprecated: staleEntry.isDeprecated,
          deprecationMessage: staleEntry.deprecationMessage,
          repositoryUrl: staleEntry.repositoryUrl,
        };
      }
    }
    throw error;
  }
}

/**
 * Get the latest version of a package
 */
export async function getLatestVersion(packageName: string, forceRefresh: boolean = false): Promise<string> {
  const details = await getPackageDetails(packageName, forceRefresh);
  return details.latestVersion;
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
