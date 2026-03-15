import { describe, it, expect } from 'vitest';
import {
  cleanVersion,
  compareVersions,
  isUpdateAvailable,
  getSemverUpdateType,
} from '../npmService';
describe('cleanVersion', () => {
  it('removes caret prefix', () => {
    expect(cleanVersion('^1.2.3')).toBe('1.2.3');
  });

  it('removes tilde prefix', () => {
    expect(cleanVersion('~1.2.3')).toBe('1.2.3');
  });

  it('removes greater than or equal prefix', () => {
    expect(cleanVersion('>=1.2.3')).toBe('1.2.3');
  });

  it('removes less than prefix', () => {
    expect(cleanVersion('<1.2.3')).toBe('1.2.3');
  });

  it('removes equals prefix', () => {
    expect(cleanVersion('=1.2.3')).toBe('1.2.3');
  });

  it('handles multiple prefixes', () => {
    expect(cleanVersion('^>=1.2.3')).toBe('1.2.3');
  });

  it('returns clean version as-is', () => {
    expect(cleanVersion('1.2.3')).toBe('1.2.3');
  });

  it('handles versions with v prefix', () => {
    expect(cleanVersion('v1.2.3')).toBe('v1.2.3');
  });
});

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns -1 when first version is lower', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
    expect(compareVersions('1.2.3', '1.3.0')).toBe(-1);
    expect(compareVersions('1.2.3', '2.0.0')).toBe(-1);
  });

  it('returns 1 when first version is higher', () => {
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
    expect(compareVersions('1.3.0', '1.2.3')).toBe(1);
    expect(compareVersions('2.0.0', '1.2.3')).toBe(1);
  });

  it('handles versions with different lengths', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
    expect(compareVersions('1.2.1', '1.2')).toBe(1);
  });

  it('handles versions with prefixes', () => {
    expect(compareVersions('^1.2.3', '~1.2.4')).toBe(-1);
    expect(compareVersions('>=1.2.3', '1.2.3')).toBe(0);
  });
});

describe('isUpdateAvailable', () => {
  it('returns true when update is available', () => {
    expect(isUpdateAvailable('1.2.3', '1.2.4')).toBe(true);
    expect(isUpdateAvailable('1.2.3', '2.0.0')).toBe(true);
  });

  it('returns false when versions are equal', () => {
    expect(isUpdateAvailable('1.2.3', '1.2.3')).toBe(false);
  });

  it('returns false when installed is higher', () => {
    expect(isUpdateAvailable('1.2.4', '1.2.3')).toBe(false);
  });

  it('handles versions with prefixes', () => {
    expect(isUpdateAvailable('^1.2.3', '1.2.4')).toBe(true);
    expect(isUpdateAvailable('~1.2.3', '1.2.3')).toBe(false);
  });
});

describe('getSemverUpdateType', () => {
  it('detects major update', () => {
    expect(getSemverUpdateType('1.2.3', '2.0.0')).toBe('major');
    expect(getSemverUpdateType('1.0.0', '3.0.0')).toBe('major');
  });

  it('detects minor update', () => {
    expect(getSemverUpdateType('1.2.3', '1.3.0')).toBe('minor');
    expect(getSemverUpdateType('1.0.0', '1.5.0')).toBe('minor');
  });

  it('detects patch update', () => {
    expect(getSemverUpdateType('1.2.3', '1.2.4')).toBe('patch');
    expect(getSemverUpdateType('1.0.0', '1.0.5')).toBe('patch');
  });

  it('returns none when versions are equal', () => {
    expect(getSemverUpdateType('1.2.3', '1.2.3')).toBe('none');
  });

  it('returns unknown when installed is higher', () => {
    expect(getSemverUpdateType('2.0.0', '1.2.3')).toBe('unknown');
    expect(getSemverUpdateType('1.3.0', '1.2.3')).toBe('unknown');
  });

  it('handles versions with prefixes', () => {
    expect(getSemverUpdateType('^1.2.3', '2.0.0')).toBe('major');
    expect(getSemverUpdateType('~1.2.3', '1.3.0')).toBe('minor');
  });

  it('handles versions with different lengths', () => {
    expect(getSemverUpdateType('1.2', '1.3.0')).toBe('minor');
    expect(getSemverUpdateType('1', '2.0.0')).toBe('major');
  });
});
