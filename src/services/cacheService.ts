/**
 * Cache service for NPM version data
 * Enables offline mode and reduces API calls
 */

import * as fs from 'fs';
import * as path from 'path';

interface CacheEntry {
  latestVersion: string;
  lastPublishDate?: string;
  etag?: string;
  timestamp: number;
  isDeprecated?: boolean;
  deprecationMessage?: string;
}

interface CacheData {
  version: string;
  entries: Record<string, CacheEntry>;
}

const CACHE_VERSION = '1.1';
const DEFAULT_TTL_HOURS = 24; // Cache valid for 24 hours
const CACHE_FILENAME = '.npm-visual-manager-cache.json';

export class VersionCache {
  private cachePath: string;
  private cache: CacheData;
  private ttlMs: number;

  constructor(projectPath: string, ttlHours: number = DEFAULT_TTL_HOURS) {
    this.cachePath = path.join(projectPath, '.vscode', CACHE_FILENAME);
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.cache = { version: CACHE_VERSION, entries: {} };
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
      
      await fs.promises.writeFile(
        this.cachePath,
        JSON.stringify(this.cache, null, 2)
      );
    } catch (error) {
      console.warn('[npm-visual-manager] Failed to save cache:', error);
    }
  }

  /**
   * Get cached version data if valid
   */
  get(packageName: string): CacheEntry | null {
    const entry = this.cache.entries[packageName];
    if (!entry) return null;

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
    if (!entry) return false;
    
    const age = Date.now() - entry.timestamp;
    return age > this.ttlMs;
  }

  /**
   * Store version data in cache
   */
  set(packageName: string, data: Omit<CacheEntry, 'timestamp'>): void {
    this.cache.entries[packageName] = {
      ...data,
      timestamp: Date.now()
    };
  }

  /**
   * Get cache age in hours for a package
   */
  getAgeHours(packageName: string): number | null {
    const entry = this.cache.entries[packageName];
    if (!entry) return null;
    
    const age = Date.now() - entry.timestamp;
    return Math.round(age / (60 * 60 * 1000) * 10) / 10;
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
      const entry = this.cache.entries[key];
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

export function getCache(projectPath: string): VersionCache {
  if (!cacheInstances.has(projectPath)) {
    cacheInstances.set(projectPath, new VersionCache(projectPath));
  }
  return cacheInstances.get(projectPath)!;
}

export function clearCache(projectPath: string): void {
  cacheInstances.delete(projectPath);
}
