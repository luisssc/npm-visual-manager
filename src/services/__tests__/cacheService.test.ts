import { describe, it, expect, beforeEach } from 'vitest';
import { VersionCache, setGlobalStorageUri } from '../cacheService';
import * as vscode from 'vscode';

describe('VersionCache', () => {
  let cache: VersionCache;

  beforeEach(async () => {
    // Use null storageUri to use local .vscode folder for tests
    setGlobalStorageUri(null as unknown as vscode.Uri);
    cache = new VersionCache('/tmp/test-project', null, 24);
    cache.clear();
    await cache.save();
  });

  describe('LRU eviction', () => {
    it('removes oldest entries when exceeding MAX_ENTRIES', () => {
      // Add 502 entries (exceeds limit of 500)
      for (let i = 0; i < 502; i++) {
        cache.set(`package-${i}`, {
          latestVersion: '1.0.0',
          lastPublishDate: new Date().toISOString(),
        });
      }

      const stats = cache.getStats();
      expect(stats.total).toBe(500); // Should be capped at MAX_ENTRIES
    });

    it('keeps most recent entries when evicting', () => {
      // Add 502 entries
      for (let i = 0; i < 502; i++) {
        cache.set(`package-${i}`, {
          latestVersion: '1.0.0',
          lastPublishDate: new Date().toISOString(),
        });
      }

      // Oldest entries (package-0, package-1) should be removed
      expect(cache.get('package-0')).toBeNull();
      expect(cache.get('package-1')).toBeNull();

      // Newest entries should still exist
      expect(cache.get('package-500')).not.toBeNull();
      expect(cache.get('package-501')).not.toBeNull();
    });

    it('updates timestamp on existing entry and keeps it', () => {
      // Add 500 entries
      for (let i = 0; i < 500; i++) {
        cache.set(`package-${i}`, {
          latestVersion: '1.0.0',
          lastPublishDate: new Date().toISOString(),
        });
      }

      // Update the first package (makes it newest)
      cache.set('package-0', {
        latestVersion: '2.0.0',
        lastPublishDate: new Date().toISOString(),
      });

      // Add 2 more packages to trigger eviction
      cache.set('package-500', { latestVersion: '1.0.0' });
      cache.set('package-501', { latestVersion: '1.0.0' });

      // package-0 should still exist (was recently updated)
      const entry = cache.get('package-0');
      expect(entry).not.toBeNull();
      expect(entry?.latestVersion).toBe('2.0.0');

      // package-1 should be evicted (was oldest)
      expect(cache.get('package-1')).toBeNull();
    });
  });

  describe('basic operations', () => {
    it('stores and retrieves entries', () => {
      cache.set('lodash', {
        latestVersion: '4.17.21',
        lastPublishDate: '2021-02-20T00:00:00.000Z',
      });

      const entry = cache.get('lodash');
      expect(entry).not.toBeNull();
      expect(entry?.latestVersion).toBe('4.17.21');
    });

    it('returns null for non-existent entries', () => {
      expect(cache.get('non-existent')).toBeNull();
    });

    it('clears all entries', () => {
      cache.set('package-a', { latestVersion: '1.0.0' });
      cache.set('package-b', { latestVersion: '2.0.0' });

      cache.clear();

      expect(cache.get('package-a')).toBeNull();
      expect(cache.get('package-b')).toBeNull();
      expect(cache.getStats().total).toBe(0);
    });

    it('tracks cache stats correctly', () => {
      cache.set('fresh', { latestVersion: '1.0.0' });

      const stats = cache.getStats();
      expect(stats.total).toBe(1);
      expect(stats.valid).toBe(1);
      expect(stats.stale).toBe(0);
    });
  });
});
