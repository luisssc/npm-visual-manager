/**
 * Service to search packages in npm registry
 */

import * as https from 'https';

export interface SearchResult {
  name: string;
  version: string;
  description: string;
  keywords?: string[];
  date: string;
  author?: { name?: string; email?: string };
  publisher?: { username?: string; email?: string };
  downloads?: { weekly?: number };
  score?: { final: number; quality: number; popularity: number; maintenance: number };
}

export interface SearchResponse {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description?: string;
      keywords?: string[];
      date?: string;
      author?: { name?: string; email?: string };
      publisher?: { username?: string; email?: string };
    };
    downloads?: { monthly?: number; weekly?: number };
    score?: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
    searchScore?: number;
  }>;
  total: number;
  time: string;
}

/**
 * Search packages in npm registry
 */
export function searchPackages(query: string, limit: number = 20, signal?: AbortSignal): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve([]);
      return;
    }

    if (!query.trim()) {
      resolve([]);
      return;
    }

    const encodedQuery = encodeURIComponent(query);
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodedQuery}&size=${limit}`;

    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          // eslint-disable-next-line @typescript-eslint/naming-convention
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
          if (signal?.aborted) {
            resolve([]);
            return;
          }

          try {
            if (res.statusCode === 200) {
              const response: SearchResponse = JSON.parse(data);

              const results: SearchResult[] = response.objects.map(obj => ({
                name: obj.package.name,
                version: obj.package.version,
                description: obj.package.description || '',
                keywords: obj.package.keywords,
                date: obj.package.date || '',
                author: obj.package.author,
                publisher: obj.package.publisher,
                downloads: obj.downloads ? { weekly: obj.downloads.weekly } : undefined,
                score: obj.score
                  ? {
                      final: obj.score.final,
                      quality: obj.score.detail.quality,
                      popularity: obj.score.detail.popularity,
                      maintenance: obj.score.detail.maintenance,
                    }
                  : undefined,
              }));

              resolve(results);
            } else {
              reject(new Error(`Search failed with status ${res.statusCode}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse search response: ${error}`));
          }
        });
      }
    );

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          req.destroy();
          resolve([]);
        },
        { once: true }
      );
    }

    req.on('error', error => {
      if (signal?.aborted) {
        resolve([]);
      } else {
        reject(new Error(`Search request failed: ${error.message}`));
      }
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Search request timeout'));
    });
  });
}

/**
 * Format download count for display
 */
export function formatDownloads(weekly?: number): string {
  if (!weekly) {
    return '-';
  }

  if (weekly >= 1000000) {
    return `${(weekly / 1000000).toFixed(1)}M`;
  }
  if (weekly >= 1000) {
    return `${(weekly / 1000).toFixed(1)}K`;
  }
  return weekly.toString();
}
