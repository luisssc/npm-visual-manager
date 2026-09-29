import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execute, detect } = vi.hoisted(() => ({ execute: vi.fn(), detect: vi.fn() }));
vi.mock('child_process', () => ({
  exec: Object.assign(() => {}, { [Symbol.for('nodejs.util.promisify.custom')]: execute }),
}));
vi.mock('../packageManagerService', async importOriginal => ({
  ...(await importOriginal<typeof import('../packageManagerService')>()),
  detectPackageManager: detect,
  getAuditCommandForProject: vi.fn().mockResolvedValue('npm audit --json'),
}));
vi.mock('../../utils/resolveExecutable', () => ({ resolveCommandPath: vi.fn(async command => command) }));

import { clearAuditCache, runAudit } from '../auditService';

const clean = JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: { high: 0 } } });
const vulnerable = JSON.stringify({ vulnerabilities: { demo: { severity: 'high', via: [], fixAvailable: true } } });

beforeEach(() => {
  vi.resetAllMocks();
  clearAuditCache();
  detect.mockResolvedValue('npm');
});

describe('audit failures are not clean results', () => {
  it('rejects a network failure and retries instead of caching zero vulnerabilities', async () => {
    execute.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ stdout: clean });
    await expect(runAudit('/project')).rejects.toThrow('offline');
    await expect(runAudit('/project')).resolves.toMatchObject({ vulnerabilities: [] });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it.each(['{"error":{"code":"ENOAUDIT"}}', '{"type":"error","data":"offline"}', 'invalid JSON', '', clean])(
    'rejects unsuccessful command output: %s',
    async stdout => {
      execute.mockRejectedValue(Object.assign(new Error('audit failed'), { code: 1, stdout }));
      await expect(runAudit('/project')).rejects.toThrow();
    }
  );

  it('rejects unrecognised output even with exit code zero', async () => {
    execute.mockResolvedValue({ stdout: '{"somethingElse":true}' });
    await expect(runAudit('/project')).rejects.toThrow();
  });

  it('still accepts vulnerabilities reported with a nonzero exit code', async () => {
    execute.mockRejectedValue(Object.assign(new Error('vulnerabilities found'), { code: 1, stdout: vulnerable }));
    const result = await runAudit('/project');
    expect(result.vulnerabilities).toEqual([expect.objectContaining({ packageName: 'demo', severity: 'high' })]);
    expect(await runAudit('/project')).toBe(result);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects a timed-out process even if it emitted a partial report', async () => {
    execute.mockRejectedValue(
      Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM', stdout: vulnerable })
    );
    await expect(runAudit('/project')).rejects.toThrow('timeout');
  });

  it('caches a verified clean audit', async () => {
    execute.mockResolvedValue({ stdout: clean });
    await runAudit('/project');
    await runAudit('/project');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('accepts the empty Bun advisory map', async () => {
    detect.mockResolvedValue('bun');
    execute.mockResolvedValue({ stdout: '{}' });
    await expect(runAudit('/project')).resolves.toMatchObject({ vulnerabilities: [] });
  });

  it('does not reuse a clean cache entry after a failed forced refresh', async () => {
    execute
      .mockResolvedValueOnce({ stdout: clean })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ stdout: vulnerable });
    await runAudit('/project');
    await expect(runAudit('/project', { forceRefresh: true })).rejects.toThrow('offline');
    expect((await runAudit('/project')).vulnerabilities).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('rejects a stream with an error after an advisory', async () => {
    execute.mockRejectedValue(
      Object.assign(new Error('offline'), { code: 1, stdout: `${vulnerable}\n{"type":"error","data":"offline"}` })
    );
    await expect(runAudit('/project')).rejects.toThrow();
  });
});
