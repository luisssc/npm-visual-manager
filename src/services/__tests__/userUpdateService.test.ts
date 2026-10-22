import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  forgetUserPackageUpdate,
  mergeUpdateTimes,
  parseDependencyHistory,
  recordUserPackageUpdates,
  setUserUpdateStorageDir,
} from '../userUpdateService';

const NEWER = '2026-10-01T10:00:00+02:00';
const REFORMAT = '2026-06-01T10:00:00+02:00';
const OLDER = '2026-01-01T10:00:00+02:00';

// Newest commit first, as `git log -p -U0 --format=%x00%aI` prints it.
const LOG = [
  '',
  `${NEWER}\n`,
  'diff --git a/package.json b/package.json',
  '--- a/package.json',
  '+++ b/package.json',
  '@@ -3 +3,2 @@',
  '-    "react": "^18.0.0"',
  '+    "react": "^18.0.0",',
  '+    "zod": "^3.0.0"',
  '@@ -8 +9 @@',
  '-    "test": "vitest"',
  '+    "test": "vitest run"',
  '\0',
  `${REFORMAT}\n`,
  '@@ -2,2 +2,2 @@',
  '-  "react": "^18.0.0",',
  '-  "left-pad": "^1.0.0"',
  '+    "react": "^18.0.0",',
  '+    "left-pad": "^1.0.0"',
  '\0',
  `${OLDER}\n`,
  '@@ -2,2 +2,2 @@',
  '-  "react": "^17.0.0",',
  '+  "react": "^18.0.0",',
  '+  "left-pad": "^1.0.0"',
].join('\n');

describe('parseDependencyHistory', () => {
  it('dates each dependency by the last commit that changed its version', () => {
    const updates = parseDependencyHistory(LOG);
    expect(updates.get('zod')).toBe(NEWER);
    expect(updates.get('react')).toBe(OLDER);
    expect(updates.get('left-pad')).toBe(OLDER);
  });

  it('ignores string fields that are not version specs', () => {
    expect(parseDependencyHistory(LOG).has('test')).toBe(false);
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
