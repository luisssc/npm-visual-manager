/**
 * Cache service for NPM version data
 * Enables offline mode and reduces API calls
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface CacheEntry {
  latestVersion: string;
  lastPublishDate?: string;
  etag?: string;
  timestamp: number;
  isDeprecated?: boolean;
  deprecationMessage?: string;
  repositoryUrl?: string;
}

interface CacheData {
  version: string;
  entries: Record<string, CacheEntry>;
}

const CACHE_VERSION = '1.2'; // Bumped for repositoryUrl support
const DEFAULT_TTL_HOURS = 24; // Cache valid for 24 hours
const CACHE_FILENAME = '.npm-visual-manager-cache.json';
const MAX_ENTRIES = 500; // Maximum cache entries to prevent unlimited growth

export class VersionCache {
  private cachePath: string;
  private cache: CacheData;
  private ttlMs: number;

  constructor(projectPath: string, storageUri: vscode.Uri | null, ttlHours: number = DEFAULT_TTL_HOURS) {
    // Use global storage if available, fallback to .vscode for backward compatibility
    if (storageUri) {
      // Create a safe filename from project path (replace invalid chars)
      const projectHash = this._getProjectHash(projectPath);
      this.cachePath = path.join(storageUri.fsPath, `cache-${projectHash}.json`);
    } else {
      // Fallback to old location for backward compatibility
      this.cachePath = path.join(projectPath, '.vscode', CACHE_FILENAME);
    }
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.cache = { version: CACHE_VERSION, entries: {} };
  }

  private _getProjectHash(projectPath: string): string {
    // Create a simple hash from the project path to use as filename
    // This ensures unique cache files per project while being filesystem-safe
    return Buffer.from(projectPath).toString('base64').replace(/[+/=]/g, '_');
  }

  /**
   * Load cache from disk
   */
  async load(): Promise<void> {
    try {
      if (fs.existsSync(this.cachePath)) {
        const content = await fs.promises.readFile(this.cachePath, 'utf-8');
        const data = JSON.parse(content) as CacheData;

        // Check version compatibility
        if (data.version === CACHE_VERSION) {
          this.cache = data;
        } else {
          // Reset cache if version mismatch
          this.cache = { version: CACHE_VERSION, entries: {} };
        }
      }
    } catch (error) {
      console.warn('[npm-visual-manager] Failed to load cache:', error);
      this.cache = { version: CACHE_VERSION, entries: {} };
    }
  }

  /**
   * Save cache to disk
   */
  async save(): Promise<void> {
    try {
      // Ensure .vscode directory exists
      const vscodeDir = path.dirname(this.cachePath);
      if (!fs.existsSync(vscodeDir)) {
        await fs.promises.mkdir(vscodeDir, { recursive: true });
      }

      await fs.promises.writeFile(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.warn('[npm-visual-manager] Failed to save cache:', error);
    }
  }

  /**
   * Get cached version data if valid
   */
  get(packageName: string): CacheEntry | null {
    const entry = this.cache.entries[packageName];
    if (!entry) {
      return null;
    }

    // Check TTL
    const age = Date.now() - entry.timestamp;
    if (age > this.ttlMs) {
      return null; // Expired
    }

    return entry;
  }

  /**
   * Get cached data regardless of TTL (useful as offline fallback)
   */
  getStale(packageName: string): CacheEntry | null {
    return this.cache.entries[packageName] || null;
  }

  /**
   * Check if cache entry is stale (exists but expired)
   */
  isStale(packageName: string): boolean {
    const entry = this.cache.entries[packageName];
    if (!entry) {
      return false;
    }

    const age = Date.now() - entry.timestamp;
    return age > this.ttlMs;
  }

  /**
   * Store version data in cache
   * Implements LRU eviction when cache exceeds MAX_ENTRIES
   */
  set(packageName: string, data: Omit<CacheEntry, 'timestamp'>): void {
    this.cache.entries[packageName] = {
      ...data,
      timestamp: Date.now(),
    };

    // Enforce max size limit with LRU eviction
    const entries = Object.entries(this.cache.entries);
    if (entries.length > MAX_ENTRIES) {
      // Sort by timestamp (oldest first) and remove oldest entries
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.length - MAX_ENTRIES;
      for (let i = 0; i < toRemove; i++) {
        delete this.cache.entries[entries[i]![0]];
      }
    }
  }

  /**
   * Get cache age in hours for a package
   */
  getAgeHours(packageName: string): number | null {
    const entry = this.cache.entries[packageName];
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    return Math.round((age / (60 * 60 * 1000)) * 10) / 10;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.entries = {};
  }

  /**
   * Get statistics about cache
   */
  getStats(): { total: number; valid: number; stale: number } {
    const entries = Object.keys(this.cache.entries);
    const now = Date.now();

    let valid = 0;
    let stale = 0;

    for (const key of entries) {
      const entry = this.cache.entries[key]!;
      const age = now - entry.timestamp;
      if (age > this.ttlMs) {
        stale++;
      } else {
        valid++;
      }
    }

    return { total: entries.length, valid, stale };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Object.entries(this.cache.entries)) {
      if (now - entry.timestamp > this.ttlMs) {
        delete this.cache.entries[key];
      }
    }
  }
}

// Global cache instance per project
const cacheInstances = new Map<string, VersionCache>();
let globalStorageUri: vscode.Uri | null = null;

export function setGlobalStorageUri(uri: vscode.Uri): void {
  globalStorageUri = uri;
}

export function getCache(projectPath: string): VersionCache {
  if (!cacheInstances.has(projectPath)) {
    cacheInstances.set(projectPath, new VersionCache(projectPath, globalStorageUri));
  }
  return cacheInstances.get(projectPath)!;
}

export function clearCache(projectPath: string): void {
  cacheInstances.delete(projectPath);
}
