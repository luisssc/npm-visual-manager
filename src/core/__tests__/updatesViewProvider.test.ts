import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  env: { language: 'en' },
  window: { createTreeView: vi.fn(() => ({ dispose: vi.fn() })) },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  TreeItem: class {
    constructor(public label: string) {}
  },
  ThemeIcon: class {
    constructor(public id: string) {}
  },
  Uri: { file: (filePath: string) => ({ fsPath: filePath }) },
}));

import { UpdatesViewProvider } from '../updatesViewProvider';

describe('audit failures in the updates view', () => {
  it('shows incomplete security counts and keeps failed projects visible', () => {
    const provider = new UpdatesViewProvider();
    provider.setSummary({
      updates: 0,
      vulnerablePackages: 0,
      auditFailed: true,
      projects: [
        { name: 'A', path: '/a', relativePath: '.', updates: 0, vulnerablePackages: 0 },
        { name: 'B', path: '/b', relativePath: 'b', updates: 0, vulnerablePackages: 0, auditFailed: true },
      ],
    });
    const rows = provider.getChildren();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.label).toContain('Security audit unavailable');
    expect(rows[0]?.iconPath).toMatchObject({ id: 'warning' });
    expect(rows[1]?.description).toContain('Security audit unavailable');
    expect(rows[1]?.iconPath).toMatchObject({ id: 'warning' });

    provider.setSummary({ updates: 0, vulnerablePackages: 0 });
    expect(provider.getChildren()[0]?.label).not.toContain('Security audit unavailable');
    expect(provider.getChildren()[0]?.iconPath).toMatchObject({ id: 'check' });
    provider.dispose();
  });
});
