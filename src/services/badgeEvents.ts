/**
 * Tiny event bridge so package operations (in the webview panel) can ask the
 * activity bar badge (owned by the extension entry point) to recompute,
 * without either module importing the other.
 *
 * The extension registers a single listener on activation; package operations
 * call requestBadgeRefresh() after any mutation (update/install/uninstall/
 * rollback). This is more reliable than depending solely on the package.json
 * file watcher, which does not fire consistently for atomic rewrites done by
 * npm/yarn/pnpm (notably on Windows).
 */

type BadgeRefreshListener = () => void;

let listener: BadgeRefreshListener | undefined;

export function onBadgeRefreshRequested(newListener: BadgeRefreshListener): void {
  listener = newListener;
}

export function requestBadgeRefresh(): void {
  listener?.();
}

/** Test helper: drop the registered listener. */
export function resetBadgeEvents(): void {
  listener = undefined;
}
