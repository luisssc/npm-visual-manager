import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onBadgeRefreshRequested, requestBadgeRefresh, resetBadgeEvents } from '../badgeEvents';

beforeEach(() => {
  resetBadgeEvents();
});

describe('badgeEvents', () => {
  it('invokes the registered listener on requestBadgeRefresh', () => {
    const listener = vi.fn();
    onBadgeRefreshRequested(listener);

    requestBadgeRefresh();
    requestBadgeRefresh();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no listener is registered', () => {
    expect(() => requestBadgeRefresh()).not.toThrow();
  });

  it('keeps only the most recently registered listener', () => {
    const first = vi.fn();
    const second = vi.fn();
    onBadgeRefreshRequested(first);
    onBadgeRefreshRequested(second);

    requestBadgeRefresh();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
