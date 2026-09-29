import { describe, it, expect } from 'vitest';
import { compareVersions, isUpdateAvailable, getSemverUpdateType } from '../npmService';

describe('compareVersions (concrete versions)', () => {
  const precedence = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
    '1.0.1',
    '1.1.0',
    '2.0.0',
  ];

  it('follows the SemVer precedence chain in both directions', () => {
    for (let i = 0; i < precedence.length; i++) {
      expect(compareVersions(precedence[i]!, precedence[i]!)).toBe(0);
      for (let j = i + 1; j < precedence.length; j++) {
        expect(compareVersions(precedence[i]!, precedence[j]!)).toBe(-1);
        expect(compareVersions(precedence[j]!, precedence[i]!)).toBe(1);
      }
    }
  });

  it.each(['1.0.0+build.7', '1.0.0+build.007', '1.0.0+build-beta'])('ignores metadata in %s', version => {
    expect(compareVersions(version, '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', version)).toBe(0);
  });

  it('compares numeric prerelease identifiers before alphanumeric ones', () => {
    expect(compareVersions('1.0.0-11', '1.0.0-alpha')).toBe(-1);
    expect(compareVersions('1.0.0-beta.2+build.9', '1.0.0-beta.11+build.1')).toBe(-1);
  });

  it.each(['^1.2.3', '~1.2.3', '>=1.2.3', '1.2', 'latest', '1.0.0-beta.01', '01.0.0'])(
    'does not silently coerce a range or invalid version: %s',
    version => {
      expect(() => compareVersions(version, '1.2.3')).toThrow();
    }
  );
});

describe('update detection (declared versions and ranges)', () => {
  it.each([
    ['1.2.3', '2.0.0', 'major'],
    ['1.2.3', '1.3.0', 'minor'],
    ['1.2.3', '1.2.4', 'patch'],
    ['1.2.3', '1.2.3', 'none'],
    ['2.0.0', '1.2.3', 'unknown'],
    ['1.3.0', '1.2.3', 'unknown'],
    ['1.2.4', '1.2.3', 'unknown'],
    ['1.0.0-beta.1', '1.0.0', 'release'],
    ['1.0.0-beta.2', '1.0.0-beta.11', 'prerelease'],
    ['1.0.0', '1.0.0-beta.1', 'unknown'],
    ['1.0.0-beta.11', '1.0.0-beta.2', 'unknown'],
    ['1.0.0+build.7', '1.0.0', 'none'],
    ['1.0.0', '1.0.0+build.7', 'none'],
    ['1.0.0-beta.1+a', '1.0.0-beta.1+b', 'none'],
    ['^1.2.3', '1.2.4', 'patch'],
    ['~1.2.3', '1.2.3', 'none'],
    ['^1.2.3', '2.0.0', 'major'],
    ['^1.0.0-beta.1', '1.0.0', 'release'],
    ['1.2', '1.3.0', 'minor'],
    ['1', '2.0.0', 'major'],
    ['1.2.x', '1.2.4', 'patch'],
    ['>=1.2.3 <2.0.0', '1.3.0', 'minor'],
    ['1.2.3 - 2.0.0', '2.0.0', 'major'],
    ['^1.2.3 || ^3.0.0', '3.0.0', 'major'],
    ['>1.2.3', '1.2.4', 'none'],
    ['*', '1.0.0', 'major'],
    ['<1.0.0', '1.0.0', 'major'],
  ])('%s -> %s: %s', (declared, latest, expected) => {
    expect(getSemverUpdateType(declared, latest)).toBe(expected);
    expect(isUpdateAvailable(declared, latest)).toBe(expected !== 'none' && expected !== 'unknown');
  });

  it.each([
    '',
    'latest',
    'workspace:*',
    'file:../local',
    'npm:other@^1',
    'git+https://example.test/repo',
    '^>=1.2.3',
    '1.0.0-beta.01',
    '>=2 <1',
    '<0.0.0-0',
  ])('does not invent a baseline for %s', declared => {
    expect(getSemverUpdateType(declared, '2.0.0')).toBe('unknown');
    expect(isUpdateAvailable(declared, '2.0.0')).toBe(false);
  });

  it.each(['latest', '^2.0.0', '2.0', 'garbage', ''])('requires a concrete latest version: %s', latest => {
    expect(getSemverUpdateType('1.0.0', latest)).toBe('unknown');
    expect(isUpdateAvailable('1.0.0', latest)).toBe(false);
  });
});
