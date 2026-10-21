import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  forgetUserPackageUpdate,
  mergeUpdateTimes,
  parseBlameForDependencies,
  recordUserPackageUpdates,
  setUserUpdateStorageDir,
} from '../userUpdateService';

const HASH_A = 'a'.repeat(40);
const HASH_B = 'b'.repeat(40);
const HASH_ZERO = '0'.repeat(40);

const BLAME = [
  `${HASH_A} 1 1 1`,
  'author A',
  'author-time 1710000000',
  'filename package.json',
  '\t  "dependencies": {',
  `${HASH_A} 2 2 1`,
  '\t    "react": "^18.0.0",',
  `${HASH_B} 3 3 2`,
  'author B',
  'author-time 1720000000',
  'filename package.json',
  '\t    "@tanstack/react-query": "^5.0.0",',
  `${HASH_B} 4 4 1`,
  '\t  },',
  `${HASH_A} 5 5 2`,
  'author A',
  'author-time 1710000000',
  'filename package.json',
  '\t  "scripts": {',
  `${HASH_A} 6 6 1`,
  '\t    "test": "vitest"',
  `${HASH_A} 7 7 1`,
  '\t  },',
  `${HASH_ZERO} 8 8 1`,
  'author Not Committed Yet',
  'author-time 0',
  'filename package.json',
  '\t  "devDependencies": {',
  `${HASH_ZERO} 9 9 1`,
  '\t    "left-pad": "^1.0.0"',
  `${HASH_ZERO} 10 10 1`,
  '\t  }',
].join('\n');

describe('parseBlameForDependencies', () => {
  it('reads the last committed change of each direct dependency', () => {
    const updates = parseBlameForDependencies(BLAME);
    expect(updates.get('react')).toBe(new Date(1710000000 * 1000).toISOString());
    expect(updates.get('@tanstack/react-query')).toBe(new Date(1720000000 * 1000).toISOString());
    expect(updates.has('test')).toBe(false);
    expect(updates.has('left-pad')).toBe(false);
  });
});

describe('mergeUpdateTimes', () => {
  it('keeps the later of the commit date and an update made in this extension', () => {
    const fromGit = new Map([['react', '2024-01-01T00:00:00.000Z']]);
    const fromTool = new Map([
      ['react', '2026-10-21T00:00:00.000Z'],
      ['left-pad', '2026-10-20T00:00:00.000Z'],
    ]);
    const merged = mergeUpdateTimes(fromGit, fromTool);
    expect(merged.get('react')).toBe('2026-10-21T00:00:00.000Z');
    expect(merged.get('left-pad')).toBe('2026-10-20T00:00:00.000Z');
  });
});

describe('recorded updates', () => {
  let dir = '';

  afterEach(() => {
    setUserUpdateStorageDir('');
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('remembers an extension update and drops it after uninstall', () => {
    dir = mkdtempSync(join(tmpdir(), 'nvm-user-updates-'));
    setUserUpdateStorageDir(dir);
    recordUserPackageUpdates('/tmp/project', ['react'], '2026-10-21T00:00:00.000Z');
    forgetUserPackageUpdate('/tmp/project', 'react');
    recordUserPackageUpdates('/tmp/other', ['left-pad'], '2026-10-23T00:00:00.000Z');

    const saved = JSON.parse(readFileSync(join(dir, 'user-package-updates.json'), 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    expect(saved[resolve('/tmp/project')]?.react).toBeUndefined();
    expect(saved[resolve('/tmp/other')]?.['left-pad']).toBe('2026-10-23T00:00:00.000Z');
  });
});
