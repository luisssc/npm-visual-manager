/**
 * Service to search packages in npm registry
 */

import { getRegistryClient, RegistryError, RegistryTarget } from './registryService';
import { getVersionPublishDate, type NpmPackageInfo } from './npmService';

export interface SearchResult {
  packageUrl?: string;
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

/** Search the configured registry. GitLab also supports exact-name lookup. */
export async function searchPackages(
  query: string,
  limit: number = 20,
  signal?: AbortSignal,
  projectPath: string = process.cwd()
): Promise<SearchResult[]> {
  query = query.trim();
  if (!query || signal?.aborted) {
    return [];
  }
  const target = (await getRegistryClient(projectPath)).forPackage(query);
  // GitLab's npm API exposes package metadata but not npm's search endpoint.
  const gitlab = /\/api\/v4\/(?:projects\/[^/]+\/|groups\/[^/]+\/-\/)?packages\/npm\/$/.test(
    new URL(target.url).pathname
  );
  try {
    if (gitlab) {
      return await exactMatch(target, query, signal);
    }
    try {
      const response = await target.json<SearchResponse>(
        '-/v1/search?text=' + encodeURIComponent(query) + '&size=' + limit,
        signal
      );
      if (!Array.isArray(response?.objects)) {
        throw new RegistryError('The configured registry returned invalid search results.');
      }
      return response.objects.map(obj => ({
        name: obj.package.name,
        version: obj.package.version,
        description: obj.package.description || '',
        keywords: obj.package.keywords,
        date: obj.package.date || '',
        author: obj.package.author,
        publisher: obj.package.publisher,
        downloads: obj.downloads ? { weekly: obj.downloads.weekly } : undefined,
        score: obj.score ? { final: obj.score.final, ...obj.score.detail } : undefined,
        packageUrl: target.packageUrl(obj.package.name),
      }));
    } catch (error) {
      if (error instanceof RegistryError && [404, 405, 501].includes(error.statusCode ?? 0)) {
        return await exactMatch(target, query, signal);
      }
      throw error;
    }
  } catch (error) {
    if (signal?.aborted) {
      return [];
    }
    throw error;
  }
}

async function exactMatch(target: RegistryTarget, name: string, signal?: AbortSignal): Promise<SearchResult[]> {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    return [];
  }
  try {
    const info = await target.json<NpmPackageInfo>(encodeURIComponent(name), signal);
    const version = info?.['dist-tags']?.latest;
    if (!version || !info.versions?.[version]) {
      throw new RegistryError('The configured registry returned invalid package metadata.');
    }
    const metadata = info.versions[version] as { description?: string; keywords?: string[] };
    return [
      {
        name: info.name || name,
        version,
        description: metadata.description || '',
        keywords: metadata.keywords,
        date: getVersionPublishDate(info, version) ?? '',
        packageUrl: target.packageUrl(name),
      },
    ];
  } catch (error) {
    if (error instanceof RegistryError && error.statusCode === 404) {
      return [];
    }
    throw error;
  }
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
