import { describe, expect, it } from 'vitest';
import { isNewerVersion, nodeVersionFromDistUrl, versionFromRegistryDocument } from '../nodeVersionService';

describe('runtime update checks', () => {
  it('treats a higher stable version as an update', () => {
    expect(isNewerVersion('26.12.0', '26.11.1')).toBe(true);
    expect(isNewerVersion('v11.21.0', '11.20.0')).toBe(true);
    expect(isNewerVersion('26.11.1', '26.11.1')).toBe(false);
    expect(isNewerVersion('26.11.0', '26.11.1')).toBe(false);
    expect(isNewerVersion('26.12.0-rc.1', '26.11.1')).toBe(false);
    expect(isNewerVersion('1.0.0', 'unknown')).toBe(false);
  });

  it('reads a nodejs dist redirect and an npm latest document', () => {
    expect(nodeVersionFromDistUrl('https://nodejs.org/dist/v26.12.0/')).toBe('26.12.0');
    expect(nodeVersionFromDistUrl('https://nodejs.org/dist/latest-v26.x/')).toBeNull();
    expect(versionFromRegistryDocument({ version: '11.21.0' })).toBe('11.21.0');
    expect(versionFromRegistryDocument({ version: '11.21.0-next.1' })).toBeNull();
    expect(versionFromRegistryDocument(null)).toBeNull();
  });
});
