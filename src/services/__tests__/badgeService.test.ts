import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectDirectDependencies, countProjectUpdates, computeWorkspaceBadge } from '../badgeService';
import { findPackageJson, readPackageJson } from '../packageService';
import { getPackageDetails } from '../npmService';
import { runAudit } from '../auditService';
import { findAllProjectsMultiRoot } from '../workspaceService';
import type { AuditResult } from '../auditService';

vi.mock('../packageService', () => ({
  findPackageJson: vi.fn(),
  readPackageJson: vi.fn(),
}));

vi.mock('../npmService', async importOriginal => {
  const actual = await importOriginal<typeof import('../npmService')>();
  return {
    ...actual,
    getPackageDetails: vi.fn(),
    setGlobalCache: vi.fn(),
  };
});

vi.mock('../cacheService', () => ({
  getCache: vi.fn(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../auditService', () => ({
  runAudit: vi.fn(),
}));

vi.mock('../workspaceService', () => ({
  findAllProjectsMultiRoot: vi.fn(),
}));

const mockFindPackageJson = vi.mocked(findPackageJson);
const mockReadPackageJson = vi.mocked(readPackageJson);
const mockGetPackageDetails = vi.mocked(getPackageDetails);
const mockRunAudit = vi.mocked(runAudit);
const mockFindAllProjectsMultiRoot = vi.mocked(findAllProjectsMultiRoot);

const EMPTY_AUDIT: AuditResult = {
  vulnerabilities: [],
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    totalDependencies: 0,
  },
};

function auditWith(...packageNames: string[]): AuditResult {
  return {
    ...EMPTY_AUDIT,
    vulnerabilities: packageNames.map(name => ({
      id: `vuln-${name}`,
      title: `Vulnerability in ${name}`,
      severity: 'high' as const,
      packageName: name,
      vulnerableVersions: '<1.0.0',
      patchedVersions: '>=1.0.0',
      overview: '',
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('collectDirectDependencies', () => {
  it('collects prod, dev and peer dependencies', () => {
    const deps = collectDirectDependencies({
      dependencies: { react: '^18.0.0' },
      devDependencies: { vitest: '^4.0.0' },
      peerDependencies: { 'react-dom': '^18.0.0' },
    });

    expect(deps.size).toBe(3);
    expect(deps.get('react')).toBe('^18.0.0');
    expect(deps.get('vitest')).toBe('^4.0.0');
    expect(deps.get('react-dom')).toBe('^18.0.0');
  });

  it('keeps the first occurrence when a package appears in multiple sections', () => {
    const deps = collectDirectDependencies({
      dependencies: { react: '^18.0.0' },
      devDependencies: { react: '^17.0.0' },
    });

    expect(deps.size).toBe(1);
    expect(deps.get('react')).toBe('^18.0.0');
  });

  it('returns empty map for a package.json without dependencies', () => {
    expect(collectDirectDependencies({}).size).toBe(0);
  });
});

describe('countProjectUpdates', () => {
  it('counts major, minor and patch updates but not up-to-date packages', async () => {
    mockFindPackageJson.mockResolvedValue('/project/package.json');
    mockReadPackageJson.mockResolvedValue({
      dependencies: {
        'pkg-major': '^1.0.0',
        'pkg-minor': '^2.0.0',
        'pkg-patch': '^3.0.0',
        'pkg-current': '^4.0.0',
      },
    });
    const latestByName: Record<string, string> = {
      'pkg-major': '2.0.0',
      'pkg-minor': '2.1.0',
      'pkg-patch': '3.0.1',
      'pkg-current': '4.0.0',
    };
    mockGetPackageDetails.mockImplementation(async name => ({ latestVersion: latestByName[name]! }));

    const result = await countProjectUpdates('/project');

    expect(result.updates).toBe(3);
    expect(result.directDependencies).toEqual(new Set(['pkg-major', 'pkg-minor', 'pkg-patch', 'pkg-current']));
  });

  it('skips ignored packages for update counting but keeps them as direct dependencies', async () => {
    mockFindPackageJson.mockResolvedValue('/project/package.json');
    mockReadPackageJson.mockResolvedValue({
      dependencies: { 'pkg-ignored': '^1.0.0', 'pkg-normal': '^1.0.0' },
    });
    mockGetPackageDetails.mockResolvedValue({ latestVersion: '2.0.0' });

    const result = await countProjectUpdates('/project', {
      isIgnored: name => name === 'pkg-ignored',
    });

    expect(result.updates).toBe(1);
    expect(mockGetPackageDetails).not.toHaveBeenCalledWith('pkg-ignored');
    expect(result.directDependencies.has('pkg-ignored')).toBe(true);
  });

  it('skips local/workspace/git packages without querying the registry', async () => {
    mockFindPackageJson.mockResolvedValue('/project/package.json');
    mockReadPackageJson.mockResolvedValue({
      dependencies: {
        'pkg-file': 'file:../shared',
        'pkg-workspace': 'workspace:*',
        'pkg-git': 'github:user/repo',
        'pkg-normal': '^1.0.0',
      },
    });
    mockGetPackageDetails.mockResolvedValue({ latestVersion: '1.0.0' });

    const result = await countProjectUpdates('/project');

    expect(mockGetPackageDetails).toHaveBeenCalledTimes(1);
    expect(mockGetPackageDetails).toHaveBeenCalledWith('pkg-normal');
    expect(result.directDependencies.size).toBe(4);
  });

  it('does not count packages whose registry check fails', async () => {
    mockFindPackageJson.mockResolvedValue('/project/package.json');
    mockReadPackageJson.mockResolvedValue({
      dependencies: { 'pkg-private': '^1.0.0', 'pkg-normal': '^1.0.0' },
    });
    mockGetPackageDetails.mockImplementation(async name => {
      if (name === 'pkg-private') {
        throw new Error('404');
      }
      return { latestVersion: '2.0.0' };
    });

    const result = await countProjectUpdates('/project');

    expect(result.updates).toBe(1);
  });

  it('returns zero when no package.json exists', async () => {
    mockFindPackageJson.mockResolvedValue(null);

    const result = await countProjectUpdates('/project');

    expect(result.updates).toBe(0);
    expect(result.directDependencies.size).toBe(0);
  });
});

describe('computeWorkspaceBadge', () => {
  it('aggregates updates across all discovered projects', async () => {
    mockFindAllProjectsMultiRoot.mockResolvedValue([
      { name: 'app-a', path: '/root/app-a', relativePath: 'app-a' },
      { name: 'app-b', path: '/root/app-b', relativePath: 'app-b' },
    ]);
    mockFindPackageJson.mockImplementation(async projectPath => `${projectPath}/package.json`);
    mockReadPackageJson.mockImplementation(async packageJsonPath => {
      if (packageJsonPath.includes('app-a')) {
        return { dependencies: { 'pkg-a': '^1.0.0' } };
      }
      return { dependencies: { 'pkg-b': '^1.0.0' } };
    });
    mockGetPackageDetails.mockResolvedValue({ latestVersion: '2.0.0' });
    mockRunAudit.mockResolvedValue(EMPTY_AUDIT);

    const summary = await computeWorkspaceBadge(['/root']);

    expect(summary.updates).toBe(2);
    expect(summary.vulnerablePackages).toBe(0);
  });

  it('counts vulnerable packages only when they are direct dependencies', async () => {
    mockFindAllProjectsMultiRoot.mockResolvedValue([{ name: 'app', path: '/root', relativePath: '.' }]);
    mockFindPackageJson.mockResolvedValue('/root/package.json');
    mockReadPackageJson.mockResolvedValue({
      dependencies: { 'pkg-direct': '^1.0.0' },
    });
    mockGetPackageDetails.mockResolvedValue({ latestVersion: '1.0.0' });
    mockRunAudit.mockResolvedValue(auditWith('pkg-direct', 'pkg-transitive'));

    const summary = await computeWorkspaceBadge(['/root']);

    expect(summary.vulnerablePackages).toBe(1);
  });

  it('detects vulnerabilities in subprojects with their own lockfile (audit runs per project)', async () => {
    mockFindAllProjectsMultiRoot.mockResolvedValue([
      { name: 'root', path: '/root', relativePath: '.' },
      { name: 'mfe-a', path: '/root/mfe-a', relativePath: 'mfe-a' },
    ]);
    mockFindPackageJson.mockImplementation(async projectPath => `${projectPath}/package.json`);
    mockReadPackageJson.mockImplementation(async packageJsonPath => {
      if (packageJsonPath.includes('mfe-a')) {
        return { dependencies: { 'pkg-vulnerable': '^1.0.0' } };
      }
      return { dependencies: { 'pkg-clean': '^1.0.0' } };
    });
    mockGetPackageDetails.mockResolvedValue({ latestVersion: '1.0.0' });
    mockRunAudit.mockImplementation(async projectPath => {
      // Vulnerability only visible when auditing the subproject itself
      return projectPath === '/root/mfe-a' ? auditWith('pkg-vulnerable') : EMPTY_AUDIT;
    });

    const summary = await computeWorkspaceBadge(['/root']);

    expect(mockRunAudit).toHaveBeenCalledWith('/root');
    expect(mockRunAudit).toHaveBeenCalledWith('/root/mfe-a');
    expect(summary.vulnerablePackages).toBe(1);
  });

  it('sums the same vulnerable package across projects, matching the per-project update count', async () => {
    mockFindAllProjectsMultiRoot.mockResolvedValue([
      { name: 'mfe-a', path: '/root/mfe-a', relativePath: 'mfe-a' },
      { name: 'mfe-b', path: '/root/mfe-b', relativePath: 'mfe-b' },
    ]);
    mockFindPackageJson.mockImplementation(async projectPath => `${projectPath}/package.json`);
    mockReadPackageJson.mockResolvedValue({ dependencies: { 'pkg-vulnerable': '^1.0.0' } });
    mockGetPackageDetails.mockResolvedValue({ latestVersion: '1.0.0' });
    mockRunAudit.mockResolvedValue(auditWith('pkg-vulnerable'));

    const summary = await computeWorkspaceBadge(['/root']);

    expect(summary.vulnerablePackages).toBe(2);
  });

  it('counts each vulnerable package once even with multiple advisories', async () => {
    mockFindAllProjectsMultiRoot.mockResolvedValue([{ name: 'app', path: '/root', relativePath: '.' }]);
    mockFindPackageJson.mockResolvedValue('/root/package.json');
    mockReadPackageJson.mockResolvedValue({ dependencies: { 'pkg-direct': '^1.0.0' } });
    mockGetPackageDetails.mockResolvedValue({ latestVersion: '1.0.0' });
    mockRunAudit.mockResolvedValue(auditWith('pkg-direct', 'pkg-direct'));

    const summary = await computeWorkspaceBadge(['/root']);

    expect(summary.vulnerablePackages).toBe(1);
  });

  it('survives an audit failure and still reports updates', async () => {
    mockFindAllProjectsMultiRoot.mockResolvedValue([{ name: 'app', path: '/root', relativePath: '.' }]);
    mockFindPackageJson.mockResolvedValue('/root/package.json');
    mockReadPackageJson.mockResolvedValue({ dependencies: { 'pkg-a': '^1.0.0' } });
    mockGetPackageDetails.mockResolvedValue({ latestVersion: '1.1.0' });
    mockRunAudit.mockRejectedValue(new Error('audit exploded'));

    const summary = await computeWorkspaceBadge(['/root']);

    expect(summary.updates).toBe(1);
    expect(summary.vulnerablePackages).toBe(0);
  });

  it('returns zeros for an empty workspace', async () => {
    const summary = await computeWorkspaceBadge([]);

    expect(summary).toEqual({ updates: 0, vulnerablePackages: 0 });
    expect(mockFindAllProjectsMultiRoot).not.toHaveBeenCalled();
  });
});
