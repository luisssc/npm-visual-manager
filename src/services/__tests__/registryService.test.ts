import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import type { AddressInfo } from 'net';

vi.mock('../registryService', async importOriginal => ({
  ...(await importOriginal<typeof import('../registryService')>()),
  getRegistryClient: vi.fn(),
}));

import { getRegistryClient, loadRegistryClient, RegistryClient } from '../registryService';
import { getPackageDetails, getPackageVersions } from '../npmService';
import { getCache, VersionCache } from '../cacheService';
import { searchPackages } from '../searchService';

let root: string;
let project: string;
let server: http.Server;
let base: string;
let env: NodeJS.ProcessEnv;
let status: number;
let metadataOverrides: Record<string, unknown>;
let requests: Array<{ url: string; authorization?: string }>;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-vm-registry-'));
  project = path.join(root, 'project');
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'fixture' }));
  requests = [];
  status = 200;
  metadataOverrides = {};
  server = http.createServer((req, res) => {
    requests.push({ url: req.url!, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = status;
    if (status !== 200) {
      res.end(JSON.stringify({ error: 'fixture-secret must never appear in errors' }));
    } else if (req.url!.includes('/-/v1/search')) {
      if (req.url!.startsWith('/unsupported/')) {
        res.statusCode = 404;
        res.end('{}');
      } else {
        res.end(JSON.stringify({ objects: [{ package: { name: 'demo', version: '1.0.0' } }] }));
      }
    } else {
      const version = req.url!.includes('/84/') ? '2.0.0' : '1.0.0';
      const name = decodeURIComponent(req.url!.split('/').pop()!);
      res.end(
        JSON.stringify({
          name,
          'dist-tags': { latest: version },
          versions: {
            [version]: { description: 'Private fixture', repository: { url: 'https://example.test/repo.git' } },
          },
          time: { [version]: '2026-01-01T00:00:00Z' },
          ...metadataOverrides,
        })
      );
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  env = {
    HOME: root,
    USERPROFILE: root,
    NPM_CONFIG_USERCONFIG: path.join(root, 'user.npmrc'),
    NPM_CONFIG_GLOBALCONFIG: path.join(root, 'global.npmrc'),
    TEST_TOKEN: 'fixture-secret',
  };
  await fs.writeFile(env.NPM_CONFIG_USERCONFIG!, `registry=${base}/public/\nnoproxy=*\n`);
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  // Only the directory returned by mkdtemp above is removed.
  await fs.rm(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

async function privateClient(id = 42) {
  const url = `${base}/api/v4/projects/${id}/packages/npm/`;
  await fs.writeFile(
    path.join(project, '.npmrc'),
    `@company:registry=${url}\n//127.0.0.1:${(server.address() as AddressInfo).port}/api/v4/projects/${id}/packages/npm/:_authToken="\${TEST_TOKEN}"\n`
  );
  const client = await loadRegistryClient(project, env);
  vi.mocked(getRegistryClient).mockResolvedValue(client);
  return client;
}

describe('configured private registries', () => {
  it('discards persisted metadata whose publication date may have been inferred', async () => {
    await fs.mkdir(path.join(project, '.vscode'));
    await fs.writeFile(path.join(project, '.vscode', '.npm-visual-manager-cache.json'), JSON.stringify({
      version: '1.2',
      entries: { demo: { latestVersion: '1.0.0', lastPublishDate: '2026-09-28T00:00:00Z', timestamp: Date.now() } },
    }));
    const cache = new VersionCache(project, null);
    await cache.load();
    expect(cache.get('demo')).toBeNull();
    expect(cache.getStale('demo')).toBeNull();
  });

  it.each([undefined, { modified: '2026-09-28T00:00:00Z' }])(
    'does not invent version dates when metadata has no per-version timestamps: %j', async time => {
      await privateClient();
      metadataOverrides = { versions: { '1.0.0': {}, '0.9.0': {} }, time };
      const versions = await getPackageVersions('@company/demo', 20, project);
      expect(versions.map(version => version.date)).toEqual(['', '']);
      expect((await getPackageDetails('@company/demo', false, project)).lastPublishDate).toBeUndefined();
      expect((await searchPackages('@company/demo', 20, undefined, project))[0]?.date).toBe('');
    }
  );

  it('preserves individual publication dates while leaving missing and malformed dates unknown', async () => {
    await privateClient();
    metadataOverrides = {
      versions: { '1.0.0': {}, '0.9.0': {}, '0.8.0': {}, '0.7.0-beta.1': {} },
      time: { '1.0.0': '2026-07-01T00:00:00Z', '0.9.0': '2025-01-01T00:00:00Z', '0.8.0': 'invalid', modified: '2026-09-28T00:00:00Z' },
    };
    const versions = await getPackageVersions('@company/demo', 20, project);
    expect(versions.map(version => version.date)).toEqual(['2026-07-01T00:00:00Z', '2025-01-01T00:00:00Z', '', '']);
    expect((await getPackageDetails('@company/demo', false, project)).lastPublishDate).toBe('2026-07-01T00:00:00Z');
    expect((await searchPackages('@company/demo', 20, undefined, project))[0]?.date).toBe('2026-07-01T00:00:00Z');
  });

  it('recognises a GitLab project scope and expands its token without sending it to the default registry', async () => {
    const client = await privateClient();
    expect(client.forPackage('@company/demo').url).toBe(`${base}/api/v4/projects/42/packages/npm/`);
    await client.forPackage('@company/demo').json(encodeURIComponent('@company/demo'));
    await client.forPackage('demo').json('demo');
    expect(requests).toEqual([
      { url: '/api/v4/projects/42/packages/npm/%40company%2Fdemo', authorization: 'Bearer fixture-secret' },
      { url: '/public/demo', authorization: undefined },
    ]);
  });

  it('keeps credentials separate for two feeds on the same host', async () => {
    const client = await privateClient();
    await fs.appendFile(path.join(project, '.npmrc'), `@other:registry=${base}/api/v4/projects/84/packages/npm/\n`);
    const updated = await loadRegistryClient(project, env);
    await client.forPackage('@company/demo').json('demo');
    await updated.forPackage('@other/demo').json('demo');
    expect(requests[1]?.authorization).toBeUndefined();
  });

  it('respects project > user > global configuration and environment overrides', async () => {
    const originalEnv = { ...env };
    await fs.writeFile(env.NPM_CONFIG_GLOBALCONFIG!, `registry=${base}/global/\n`);
    expect((await loadRegistryClient(project, env)).forPackage('demo').url).toBe(`${base}/public/`);
    await fs.writeFile(path.join(project, '.npmrc'), `registry=${base}/project/\n`);
    expect((await loadRegistryClient(project, env)).forPackage('demo').url).toBe(`${base}/project/`);
    expect(
      (await loadRegistryClient(project, { ...env, NPM_CONFIG_REGISTRY: `${base}/env/` })).forPackage('demo').url
    ).toBe(`${base}/env/`);
    expect(env).toEqual(originalEnv);
  });

  it('reads the root npmrc from a declared npm workspace', async () => {
    await privateClient();
    await fs.writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] })
    );
    const child = path.join(project, 'packages', 'child');
    await fs.mkdir(child, { recursive: true });
    await fs.writeFile(path.join(child, 'package.json'), JSON.stringify({ name: 'child' }));
    expect((await loadRegistryClient(child, env)).forPackage('@company/demo').url).toBe(
      `${base}/api/v4/projects/42/packages/npm/`
    );
  });

  it.each([401, 403])('reports HTTP %s without exposing response bodies or tokens', async code => {
    const client = await privateClient();
    status = code;
    const error = await client
      .forPackage('@company/demo')
      .json('demo')
      .catch(e => e);
    expect(error.message).toContain('access denied');
    expect(error.statusCode).toBe(code);
    expect(JSON.stringify(error) + error.stack).not.toContain('fixture-secret');
  });

  it('rejects embedded credentials and absolute resource URLs', async () => {
    const client = new RegistryClient({ registry: 'https://user:fixture-secret@example.test/' });
    expect(() => client.forPackage('demo')).toThrow('Invalid registry URL');
    const safe = await privateClient();
    await expect(safe.forPackage('demo').json('https://example.test/demo')).rejects.toThrow('Invalid registry request');
    expect(requests).toHaveLength(0);
  });
});

describe('private metadata and search', () => {
  it('orders valid versions by SemVer and does not mistake build metadata for a prerelease', async () => {
    await privateClient();
    metadataOverrides = {
      versions: Object.fromEntries([
        '1.0.0-beta.2', '1.0.0+build.7', '1.0.0', '1.0.0-beta.11',
        '2.0.0', '1.0.0+build-beta', '1.0.0-alpha', '1.0.0-rc.1',
        'latest', '^3.0.0', '1.0.0-beta.01',
      ].map(version => [version, {}])),
    };
    const versions = await getPackageVersions('@company/demo', 20, project);
    expect(versions.filter(v => v.releaseType === 'stable').map(v => v.version)).toEqual([
      '2.0.0', '1.0.0+build.7', '1.0.0', '1.0.0+build-beta',
    ]);
    expect(versions.filter(v => v.releaseType === 'prerelease').map(v => v.version)).toEqual([
      '1.0.0-rc.1', '1.0.0-beta.11', '1.0.0-beta.2', '1.0.0-alpha',
    ]);
  });

  it('fetches versions from GitLab and caches by registry instead of only package name', async () => {
    await privateClient();
    const first = await getPackageDetails('@company/demo', false, project);
    expect(first.latestVersion).toBe('1.0.0');
    expect(first.registryUrl).toBe(`${base}/api/v4/projects/42/packages/npm/`);
    expect((await getPackageDetails('@company/demo', false, project)).fromCache).toBe(true);
    expect(requests).toHaveLength(1);

    await privateClient(84);
    expect((await getPackageDetails('@company/demo', false, project)).latestVersion).toBe('2.0.0');
    expect(requests).toHaveLength(2);
    expect((await getPackageVersions('@company/demo', 20, project))[0]?.version).toBe('2.0.0');
    await getCache(project).save();
    const cached = await fs.readFile(path.join(project, '.vscode', '.npm-visual-manager-cache.json'), 'utf8');
    expect(cached).not.toContain('fixture-secret');
    expect(cached).not.toContain('_authToken');
  });

  it('does not hide authentication failures behind stale metadata or query the public registry', async () => {
    await privateClient();
    await getPackageDetails('@company/demo', false, project);
    status = 401;
    await expect(getPackageDetails('@company/demo', true, project)).rejects.toThrow('access denied');
    expect(requests.every(request => request.url.startsWith('/api/v4/projects/42/'))).toBe(true);
  });

  it('searches GitLab by exact scoped name without a public search request', async () => {
    await privateClient();
    const results = await searchPackages('@company/demo', 20, undefined, project);
    expect(results).toEqual([expect.objectContaining({ name: '@company/demo', version: '1.0.0' })]);
    expect(requests.map(request => request.url)).toEqual(['/api/v4/projects/42/packages/npm/%40company%2Fdemo']);
    expect(await searchPackages('@company/', 20, undefined, project)).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it.each(['/api/v4/groups/42/-/packages/npm/', '/api/v4/packages/npm/'])(
    'recognises GitLab endpoint %s configured in the user npmrc',
    async endpoint => {
      await fs.appendFile(
        env.NPM_CONFIG_USERCONFIG!,
        `@company:registry=${base}${endpoint}\n//127.0.0.1:${(server.address() as AddressInfo).port}${endpoint}:_authToken=fixture-secret\n`
      );
      vi.mocked(getRegistryClient).mockResolvedValue(await loadRegistryClient(project, env));
      expect(await searchPackages('@company/demo', 20, undefined, project)).toHaveLength(1);
      expect(requests).toEqual([{ url: `${endpoint}%40company%2Fdemo`, authorization: 'Bearer fixture-secret' }]);
    }
  );

  it('keeps parallel lookups in different projects on their own registry', async () => {
    const firstClient = await privateClient(42);
    const secondClient = await privateClient(84);
    const secondProject = path.join(root, 'second-project');
    vi.mocked(getRegistryClient).mockImplementation(async requestedProject =>
      requestedProject === project ? firstClient : secondClient
    );
    const [first, second] = await Promise.all([
      getPackageDetails('@company/demo', false, project),
      getPackageDetails('@company/demo', false, secondProject),
    ]);
    expect(first.latestVersion).toBe('1.0.0');
    expect(second.latestVersion).toBe('2.0.0');
    expect(first.registryUrl).not.toBe(second.registryUrl);
  });

  it('still searches the default registry and supports metadata fallback for registries without search', async () => {
    vi.mocked(getRegistryClient).mockResolvedValue(await loadRegistryClient(project, env));
    expect(await searchPackages('demo', 20, undefined, project)).toHaveLength(1);
    expect(requests[0]?.url).toBe('/public/-/v1/search?text=demo&size=20');
    vi.mocked(getRegistryClient).mockResolvedValue(
      new RegistryClient({ registry: `${base}/unsupported/`, noProxy: '*' })
    );
    expect(await searchPackages('demo', 20, undefined, project)).toHaveLength(1);
    expect(requests.at(-1)?.url).toBe('/unsupported/demo');
  });

  it('does not fetch cancelled searches', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await searchPackages('@company/demo', 20, controller.signal, project)).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});
