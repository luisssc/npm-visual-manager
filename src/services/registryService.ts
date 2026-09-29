/** npm configuration and authenticated reads, shared by metadata and search. */
import * as path from 'path';
import * as fs from 'fs/promises';

// These npm libraries do not ship TypeScript declarations. Keep their untyped
// boundary here; neither their options nor their raw errors leave this module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Config = require('@npmcli/config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { definitions, flatten, shorthands } = require('@npmcli/config/lib/definitions');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const npmFetch = require('npm-registry-fetch');

const contexts = new Map<string, { expires: number; client: Promise<RegistryClient> }>();
const CONFIG_TTL_MS = 30_000;

export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

export interface RegistryTarget {
  url: string;
  packageUrl(packageName: string): string;
  json<T>(resource: string, signal?: AbortSignal): Promise<T>;
}

function registryUrl(value: unknown): string {
  try {
    const url = new URL(String(value));
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      String(value).includes('${')
    ) {
      throw new Error();
    }
    return url.href.replace(/\/?$/, '/');
  } catch {
    throw new RegistryError(
      'Invalid registry URL in npm configuration. Use HTTP(S) and configure credentials separately.'
    );
  }
}

export class RegistryClient {
  constructor(private readonly options: Record<string, unknown>) {}

  forPackage(packageName?: string): RegistryTarget {
    const scope = packageName?.match(/^(@[^/\s]+)(?:\/|$)/)?.[1];
    const url = registryUrl(
      (scope && this.options[`${scope}:registry`]) || this.options.registry || 'https://registry.npmjs.org/'
    );
    return {
      url,
      packageUrl: name =>
        url === 'https://registry.npmjs.org/'
          ? `https://www.npmjs.com/package/${encodeURIComponent(name)}`
          : `${url}${encodeURIComponent(name)}`,
      json: async <T>(resource: string, signal?: AbortSignal): Promise<T> => {
        if (signal?.aborted) {
          throw new RegistryError('Registry request cancelled');
        }
        // Resource paths are built internally. Reject absolute URLs so a caller
        // cannot send the configured credentials to another registry.
        if (resource.startsWith('/') || !new URL(resource, url).href.startsWith(url)) {
          throw new RegistryError('Invalid registry request path');
        }
        try {
          const result = await npmFetch.json(`${url}${resource}`, {
            ...this.options,
            registry: url,
            scope: undefined,
            cache: undefined, // Only our registry-keyed metadata cache is persisted.
            fetchRetries: 0,
            timeout: 10_000,
            headers: { accept: 'application/json' },
            userAgent: 'npm-visual-manager-vscode-extension',
          });
          if (signal?.aborted) {
            throw new RegistryError('Registry request cancelled');
          }
          return result as T;
        } catch (error) {
          if (error instanceof RegistryError) {
            throw error;
          }
          const status = (error as { statusCode?: number } | null)?.statusCode;
          if (status === 401 || status === 403) {
            throw new RegistryError(
              'Registry access denied. Check the npmrc credentials and token permissions.',
              status
            );
          }
          if (status === 404) {
            throw new RegistryError('Package or search endpoint not found in the configured registry.', status);
          }
          // Raw npm errors may contain server responses, URLs or auth details.
          throw new RegistryError(
            'Registry request failed. Check the connection, proxy and npmrc certificates.',
            status
          );
        }
      },
    };
  }
}

async function npmRuntimePaths(env: NodeJS.ProcessEnv): Promise<{ npmPath: string; execPath: string }> {
  const directories = (env.PATH || env.Path || env.path || '').split(path.delimiter).filter(Boolean);
  async function find(name: string): Promise<string | undefined> {
    for (const directory of directories) {
      try {
        return await fs.realpath(path.join(directory.replace(/^"|"$/g, ''), name));
      } catch {
        // Try the next PATH entry.
      }
    }
    return undefined;
  }
  const windows = process.platform === 'win32';
  const [node, npm] = await Promise.all([find(windows ? 'node.exe' : 'node'), find(windows ? 'npm.cmd' : 'npm')]);
  const candidate =
    npm && (windows ? path.join(path.dirname(npm), 'node_modules', 'npm') : path.dirname(path.dirname(npm)));
  let npmPath = path.dirname(require.resolve('@npmcli/config/package.json'));
  if (candidate) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(candidate, 'package.json'), 'utf8'));
      if (manifest.name === 'npm') {
        npmPath = candidate;
      }
    } catch {
      // An npm-compatible shim may not have a bundled npm configuration.
    }
  }
  return { npmPath, execPath: node || process.execPath };
}

/** Load project/workspace, user, environment and npm's global configuration. */
export async function loadRegistryClient(
  projectPath: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<RegistryClient> {
  try {
    const runtime = await npmRuntimePaths(env);
    const config = new Config({
      definitions,
      flatten,
      shorthands,
      ...runtime,
      cwd: projectPath,
      argv: [], // VS Code's arguments are not npm arguments.
      // Config.load() exports npm settings back into its env object. Sharing
      // process.env would make one project's registry override every other one.
      env: { ...env },
    });
    await config.load();
    for (const entry of config.data.values()) {
      if (entry.loadError && entry.loadError.code !== 'ENOENT') {
        throw new Error();
      }
    }
    if (!config.validate()) {
      throw new Error();
    }
    // Never persist or log config.flat: it contains authentication material.
    return new RegistryClient({ ...config.flat });
  } catch {
    throw new RegistryError('Could not load npm configuration. Check the project and user npmrc files.');
  }
}

export function getRegistryClient(projectPath: string): Promise<RegistryClient> {
  const key = path.resolve(projectPath);
  const entry = contexts.get(key);
  if (entry && Date.now() < entry.expires) {
    return entry.client;
  }
  const client = loadRegistryClient(key);
  contexts.set(key, { expires: Date.now() + CONFIG_TTL_MS, client });
  void client.catch(() => {
    if (contexts.get(key)?.client === client) {
      contexts.delete(key);
    }
  });
  return client;
}

export function clearRegistryConfig(projectPath?: string): void {
  if (projectPath) {
    contexts.delete(path.resolve(projectPath));
  } else {
    contexts.clear();
  }
}
