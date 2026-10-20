import { describe, it, expect } from 'vitest';
import type { Dependency } from '../../../types';
import { buildUpdatePlan } from '../updatePlanService';

const dep = (name: string, overrides: Partial<Dependency> = {}): Dependency => ({
  name,
  declaredVersion: '^1.0.0',
  installedVersion: '1.0.0',
  latestVersion: '1.0.1',
  updateAvailable: true,
  semverUpdateType: 'patch',
  type: 'dependencies',
  ...overrides,
});

const plan = (dependencies: Dependency[], extra: Partial<Parameters<typeof buildUpdatePlan>[0]> = {}) =>
  buildUpdatePlan({
    dependencies,
    packageManager: 'npm',
    targetFile: 'apps/web/package.json',
    scripts: ['build', 'test', 'start'],
    ...extra,
  });

describe('buildUpdatePlan', () => {
  it('names the target file, package manager and existing verification scripts', () => {
    const md = plan([dep('axios')]);
    expect(md).toContain('Update the following dependency in `apps/web/package.json`');
    expect(md).toContain('The project uses **npm**');
    expect(md).toContain('run `npm run test`, `npm run build` and fix');
    expect(md).not.toContain('npm run start');
  });

  it('asks how changes were verified when no verification scripts exist', () => {
    expect(plan([dep('axios')], { scripts: ['start'] })).toContain('declares no test, lint or build scripts');
  });

  it('groups updates from lowest to highest risk and sorts each group by name', () => {
    const md = plan([
      dep('zod', { semverUpdateType: 'major', latestVersion: '4.0.0' }),
      dep('react', { semverUpdateType: 'major', latestVersion: '19.0.0' }),
      dep('lodash', { semverUpdateType: 'minor', latestVersion: '1.1.0' }),
      dep('axios'),
      dep('beta', { semverUpdateType: 'prerelease', latestVersion: '2.0.0-rc.1' }),
    ]);
    const order = [
      '## Patch',
      '`axios`',
      '## Minor',
      '`lodash`',
      '## Major',
      '`react`',
      '`zod`',
      '## Pre-release updates',
      '`beta`',
    ];
    const positions = order.map(text => md.indexOf(text));
    expect(positions.every(p => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(md).not.toContain('## Other updates');
  });

  it('moves pre-release targets out of the patch group even when the latest tag points to one', () => {
    const md = plan([
      dep('@vscode/codicons', { declaredVersion: '^0.0.45', installedVersion: '0.0.45', latestVersion: '0.0.46-24' }),
    ]);
    expect(md).not.toContain('## Patch');
    expect(md).toContain('## Pre-release updates');
    expect(md).toContain('Target is a pre-release version');
  });

  it('treats breaking bumps of 0.x versions as major updates', () => {
    const md = plan([
      dep('zero-patch', { declaredVersion: '^0.0.1', installedVersion: '0.0.1', latestVersion: '0.0.2' }),
      dep('zero-minor', {
        declaredVersion: '^0.2.0',
        installedVersion: '0.2.0',
        latestVersion: '0.3.0',
        semverUpdateType: 'minor',
      }),
      dep('zero-safe', { declaredVersion: '^0.2.0', installedVersion: '0.2.0', latestVersion: '0.2.1' }),
    ]);
    const majorSection = md.slice(md.indexOf('## Major'));
    expect(majorSection).toContain('`zero-patch`');
    expect(majorSection).toContain('`zero-minor`');
    expect(majorSection).toContain('Treated as major: in 0.x versions a minor update');
    expect(majorSection).not.toContain('`zero-safe`');
    expect(md.slice(md.indexOf('## Patch'), md.indexOf('## Major'))).toContain('`zero-safe`');
  });

  it('flags packages from the same repository to be updated together', () => {
    const md = plan([
      dep('eslint', {
        semverUpdateType: 'major',
        latestVersion: '10.0.0',
        repositoryUrl: 'https://github.com/eslint/eslint',
      }),
      dep('@eslint/js', {
        semverUpdateType: 'major',
        latestVersion: '10.0.0',
        repositoryUrl: 'https://github.com/ESLint/eslint.git',
      }),
      dep('globals', {
        semverUpdateType: 'major',
        latestVersion: '17.0.0',
        repositoryUrl: 'https://github.com/sindresorhus/globals',
      }),
    ]);
    const row = (name: string) => md.split('\n').find(line => line.startsWith(`| \`${name}\``))!;
    expect(row('eslint')).toContain('Update together with `@eslint/js` (same repository)');
    expect(row('@eslint/js')).toContain('Update together with `eslint` (same repository)');
    expect(row('globals')).not.toContain('Update together');
    expect(md).toContain('or one set of packages marked to be updated together');
  });

  it('skips packages without updates and ignored packages', () => {
    const md = plan([
      dep('axios'),
      dep('current', { updateAvailable: false, semverUpdateType: 'none' }),
      dep('ignored', { isIgnored: true }),
    ]);
    expect(md).toContain('`axios`');
    expect(md).not.toContain('`current`');
    expect(md).not.toContain('`ignored`');
  });

  it('uses commands that keep each dependency in its section', () => {
    const md = plan(
      [dep('react'), dep('vitest', { type: 'devDependencies' }), dep('react-dom', { type: 'peerDependencies' })],
      { packageManager: 'yarn', saveExact: true }
    );
    expect(md).toContain('`yarn add --exact react@1.0.1`');
    expect(md).toContain('`yarn add --dev --exact vitest@1.0.1`');
    expect(md).toContain('Edit the `peerDependencies` range in package.json');
  });

  it('links GitHub release notes but never other repository hosts', () => {
    const md = plan([
      dep('public', { repositoryUrl: 'https://github.com/acme/public.git' }),
      dep('internal', { repositoryUrl: 'https://gitlab.acme.internal/team/internal' }),
    ]);
    expect(md).toContain('[Release notes](https://github.com/acme/public/releases)');
    expect(md).not.toContain('gitlab.acme.internal');
  });

  it('never includes registry URLs', () => {
    const md = plan([
      dep('@acme/ui', { registryUrl: 'https://npm.acme.internal/', packageUrl: 'https://npm.acme.internal/@acme/ui' }),
    ]);
    expect(md).toContain('`@acme/ui`');
    expect(md).not.toContain('npm.acme.internal');
  });

  it('adds deprecation and vulnerability notes without breaking the table', () => {
    const md = plan([
      dep('request', {
        isDeprecated: true,
        deprecationMessage: 'use fetch | got\ninstead',
        vulnerabilityCount: 1,
        vulnerabilities: [{ id: 'GHSA-1234', title: 'SSRF', severity: 'high' }],
      }),
    ]);
    const row = md.split('\n').find(line => line.startsWith('| `request`'))!;
    expect(row).toContain('Current version deprecated: use fetch \\| got instead');
    expect(row).toContain('1 known vulnerability: GHSA-1234 (high)');
  });
});
