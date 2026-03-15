/**
 * Service for calculating package sizes in node_modules
 */

import * as fs from 'fs';
import * as path from 'path';

const SIZE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface SizeCacheEntry {
  formattedSize: string;
  timestamp: number;
  packageMtimeMs: number;
}

const sizeCache = new Map<string, SizeCacheEntry>();

/**
 * Calculate the size of a directory recursively (async, non-blocking)
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let size = 0;
  const dirs: string[] = [dirPath];

  while (dirs.length > 0) {
    const current = dirs.pop();
    if (!current) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const filePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        dirs.push(filePath);
        continue;
      }

      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isDirectory()) {
          dirs.push(filePath);
        } else {
          size += stats.size;
        }
      } catch {
        // Skip unreadable files/directories
      }
    }
  }

  return size;
}

/**
 * Format bytes to human readable string
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeIndex = Math.min(i, units.length - 1);

  return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(1)) + ' ' + units[safeIndex];
}

function getCacheKey(workspaceRoot: string, packageName: string): string {
  return `${path.resolve(workspaceRoot)}::${packageName}`;
}

/**
 * Get the size of a package in node_modules
 */
export async function getPackageSize(workspaceRoot: string, packageName: string): Promise<string> {
  const packagePath = path.join(workspaceRoot, 'node_modules', packageName);
  const cacheKey = getCacheKey(workspaceRoot, packageName);

  try {
    const stats = await fs.promises.stat(packagePath);
    if (!stats.isDirectory()) {
      return '-';
    }

    const cached = sizeCache.get(cacheKey);
    if (cached && cached.packageMtimeMs === stats.mtimeMs && Date.now() - cached.timestamp < SIZE_CACHE_TTL_MS) {
      return cached.formattedSize;
    }

    const sizeInBytes = await getDirectorySize(packagePath);
    const formattedSize = formatSize(sizeInBytes);

    sizeCache.set(cacheKey, {
      formattedSize,
      timestamp: Date.now(),
      packageMtimeMs: stats.mtimeMs,
    });

    return formattedSize;
  } catch {
    return '-';
  }
}

/**
 * Get sizes for all dependencies
 */
export async function getAllPackageSizes(
  workspaceRoot: string,
  dependencies: Array<{ name: string }>
): Promise<Map<string, string>> {
  const sizes = new Map<string, string>();

  await Promise.all(
    dependencies.map(async dep => {
      const size = await getPackageSize(workspaceRoot, dep.name);
      sizes.set(dep.name, size);
    })
  );

  return sizes;
}

export function clearPackageSizeCache(workspaceRoot?: string): void {
  if (!workspaceRoot) {
    sizeCache.clear();
    return;
  }

  const rootPrefix = `${path.resolve(workspaceRoot)}::`;
  for (const key of sizeCache.keys()) {
    if (key.startsWith(rootPrefix)) {
      sizeCache.delete(key);
    }
  }
}
