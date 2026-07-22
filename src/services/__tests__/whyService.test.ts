import { describe, it, expect } from 'vitest';
import {
  isValidPackageName,
  getWhyCommand,
  parseNpmLsOutput,
  parsePnpmWhyOutput,
  parseYarnWhyOutput,
} from '../whyService';

describe('isValidPackageName', () => {
  it('accepts normal and scoped package names', () => {
    expect(isValidPackageName('react')).toBe(true);
    expect(isValidPackageName('loader-utils')).toBe(true);
    expect(isValidPackageName('@types/node')).toBe(true);
    expect(isValidPackageName('@babel/plugin-transform-runtime')).toBe(true);
  });

  it('rejects names with shell metacharacters', () => {
    expect(isValidPackageName('react; rm -rf /')).toBe(false);
    expect(isValidPackageName('react && echo pwned')).toBe(false);
    expect(isValidPackageName('$(whoami)')).toBe(false);
    expect(isValidPackageName('react`id`')).toBe(false);
    expect(isValidPackageName('')).toBe(false);
  });
});

describe('getWhyCommand', () => {
  it('builds the command per package manager', () => {
    expect(getWhyCommand('npm', 'react')).toBe('npm ls react --all --json');
    expect(getWhyCommand('yarn', 'react')).toBe('yarn why react --json');
    expect(getWhyCommand('pnpm', 'react')).toBe('pnpm why react --json');
  });

  it('returns null for bun (unsupported)', () => {
    expect(getWhyCommand('bun', 'react')).toBeNull();
  });
});

describe('parseNpmLsOutput', () => {
  const npmLsJson = JSON.stringify({
    name: 'my-app',
    version: '1.0.0',
    dependencies: {
      'react-scripts': {
        version: '5.0.1',
        dependencies: {
          webpack: {
            version: '5.88.0',
            dependencies: {
              'loader-utils': { version: '2.0.4' },
            },
          },
        },
      },
      'loader-utils': { version: '2.0.4' },
    },
  });

  it('extracts all chains leading to the target with versions', () => {
    const chains = parseNpmLsOutput(npmLsJson, 'loader-utils');

    expect(chains).toContainEqual(['react-scripts@5.0.1', 'webpack@5.88.0', 'loader-utils@2.0.4']);
    expect(chains).toContainEqual(['loader-utils@2.0.4']);
    expect(chains).toHaveLength(2);
  });

  it('returns empty array when the target is not in the tree', () => {
    expect(parseNpmLsOutput(npmLsJson, 'lodash')).toEqual([]);
  });

  it('deduplicates identical chains', () => {
    const duplicated = JSON.stringify({
      dependencies: {
        a: { version: '1.0.0', dependencies: { target: { version: '1.0.0' } } },
        b: { version: '1.0.0', dependencies: { a: { version: '1.0.0', dependencies: { target: { version: '1.0.0' } } } } },
      },
    });
    const chains = parseNpmLsOutput(duplicated, 'target');
    const keys = chains.map(c => c.join('>'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  // In a workspace, `npm ls` from a subproject reports the tree rooted at the
  // monorepo root, with the subproject appearing as a child node.
  const workspaceJson = JSON.stringify({
    name: 'root',
    version: '1.0.0',
    dependencies: {
      uiconfig: {
        version: '1.0.0',
        resolved: 'file:../packages/uiconfig',
        dependencies: {
          lodash: { version: '4.17.21' },
        },
      },
    },
  });

  it('anchors to the subproject node so its direct deps are reported as direct', () => {
    const chains = parseNpmLsOutput(workspaceJson, 'lodash', 'uiconfig');
    // lodash is a direct dependency of uiconfig -> chain length 1, no 'uiconfig' prefix
    expect(chains).toEqual([['lodash@4.17.21']]);
  });

  it('without the project name, the subproject appears as a prefix (pre-fix behavior)', () => {
    const chains = parseNpmLsOutput(workspaceJson, 'lodash');
    expect(chains).toEqual([['uiconfig@1.0.0', 'lodash@4.17.21']]);
  });

  it('falls back to the root when the target is hoisted beside the subproject', () => {
    const hoisted = JSON.stringify({
      name: 'root',
      dependencies: {
        uiconfig: { version: '1.0.0', resolved: 'file:../packages/uiconfig' },
        lodash: { version: '4.17.21' },
      },
    });
    // Anchoring to uiconfig finds nothing (no deps), fallback to root finds lodash
    const chains = parseNpmLsOutput(hoisted, 'lodash', 'uiconfig');
    expect(chains).toEqual([['lodash@4.17.21']]);
  });
});

describe('parsePnpmWhyOutput', () => {
  it('parses the project array walking dependencies and devDependencies', () => {
    const pnpmJson = JSON.stringify([
      {
        name: 'my-app',
        version: '1.0.0',
        dependencies: {
          express: {
            version: '4.18.0',
            dependencies: {
              qs: { version: '6.11.0' },
            },
          },
        },
        devDependencies: {
          'webpack-cli': {
            version: '5.1.0',
            dependencies: {
              qs: { version: '6.11.0' },
            },
          },
        },
      },
    ]);

    const chains = parsePnpmWhyOutput(pnpmJson, 'qs');

    expect(chains).toContainEqual(['express@4.18.0', 'qs@6.11.0']);
    expect(chains).toContainEqual(['webpack-cli@5.1.0', 'qs@6.11.0']);
  });

  it('accepts a single project object (not wrapped in array)', () => {
    const single = JSON.stringify({
      dependencies: { target: { version: '1.0.0' } },
    });
    expect(parsePnpmWhyOutput(single, 'target')).toEqual([['target@1.0.0']]);
  });

  // pnpm 10+ changed `why --json` to a bottom-up format: each entry is the
  // queried package with a `dependents` array (who depends on it).
  it('parses the pnpm 10+ bottom-up format for a direct dependency', () => {
    const pnpm10 = JSON.stringify([
      {
        name: 'is-even',
        version: '1.0.0',
        path: '/x',
        dependents: [{ name: 'ui-config', version: '1.0.0', depField: 'dependencies' }],
      },
    ]);
    // Direct dependency of the project -> single-element chain (shown as "Direct")
    expect(parsePnpmWhyOutput(pnpm10, 'is-even')).toEqual([['is-even@1.0.0']]);
  });

  it('parses the pnpm 10+ bottom-up format for a transitive dependency', () => {
    const pnpm10 = JSON.stringify([
      {
        name: 'is-odd',
        version: '0.1.2',
        path: '/x',
        dependents: [
          {
            name: 'is-even',
            version: '1.0.0',
            dependents: [{ name: 'ui-config', version: '1.0.0', depField: 'dependencies' }],
          },
        ],
      },
    ]);
    // Chain rendered top-down: direct dependency -> ... -> target
    expect(parsePnpmWhyOutput(pnpm10, 'is-odd')).toEqual([['is-even@1.0.0', 'is-odd@0.1.2']]);
  });

  it('parses multiple dependent paths in the pnpm 10+ format', () => {
    const pnpm10 = JSON.stringify([
      {
        name: 'lodash',
        version: '4.0.0',
        dependents: [
          { name: 'a', version: '1.0.0', dependents: [{ name: 'root', version: '1.0.0', depField: 'dependencies' }] },
          { name: 'b', version: '2.0.0', dependents: [{ name: 'root', version: '1.0.0', depField: 'devDependencies' }] },
        ],
      },
    ]);
    const chains = parsePnpmWhyOutput(pnpm10, 'lodash');
    expect(chains).toContainEqual(['a@1.0.0', 'lodash@4.0.0']);
    expect(chains).toContainEqual(['b@2.0.0', 'lodash@4.0.0']);
    expect(chains).toHaveLength(2);
  });
});

describe('parseYarnWhyOutput', () => {
  it('parses direct dependency reason', () => {
    const output = [
      JSON.stringify({ type: 'step', data: { message: 'Why do we have the module "react"...?' } }),
      JSON.stringify({ type: 'info', data: 'Has been hoisted to "react"' }),
      JSON.stringify({ type: 'info', data: 'This module exists because it\'s specified in "dependencies".' }),
      JSON.stringify({ type: 'list', data: { type: 'reasons', items: ['Specified in "dependencies"'] } }),
    ].join('\n');

    const chains = parseYarnWhyOutput(output, 'react');
    expect(chains).toContainEqual(['react']);
  });

  it('parses "depends on it" chains stripping the _project segment', () => {
    const output = JSON.stringify({
      type: 'list',
      data: { type: 'reasons', items: ['"_project#react-scripts#webpack" depends on it'] },
    });

    const chains = parseYarnWhyOutput(output, 'loader-utils');
    expect(chains).toContainEqual(['react-scripts', 'webpack', 'loader-utils']);
  });

  it('parses "Hoisted from" chains replacing the last segment with the target', () => {
    const output = JSON.stringify({
      type: 'info',
      data: 'Hoisted from "_project#react-scripts#webpack#loader-utils"',
    });

    const chains = parseYarnWhyOutput(output, 'loader-utils');
    expect(chains).toContainEqual(['react-scripts', 'webpack', 'loader-utils']);
  });

  it('ignores malformed lines without throwing', () => {
    const output = 'not-json\n{"type":"info","data":"irrelevant"}\n';
    expect(parseYarnWhyOutput(output, 'react')).toEqual([]);
  });
});
