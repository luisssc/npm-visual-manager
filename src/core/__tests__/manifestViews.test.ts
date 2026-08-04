/**
 * Guards the two views contributed to the activity bar container.
 *
 * These assertions exist because the badge is easy to break invisibly. A badge
 * can only be set on a live `TreeView` or `WebviewView`, and VS Code defers
 * creating a `WebviewView` until the view first becomes visible. So the badge
 * has to live on the eagerly-created tree view: if that view is dropped from
 * the manifest, or switched to `"type": "webview"`, the count silently goes
 * back to never showing until the user opens the sidebar — with nothing failing
 * to point at the cause.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const CONTAINER_ID = 'npm-visual-manager';
const WELCOME_VIEW_ID = 'npm-visual-manager.sidebar';
/** Keep in sync with `UpdatesViewProvider.viewType`. */
const BADGE_VIEW_ID = 'npm-visual-manager.updates';

const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as {
  activationEvents: string[];
  contributes: {
    views: Record<string, Array<{ id: string; type?: string; name: string; visibility?: string }>>;
  };
};

const containerViews = manifest.contributes.views[CONTAINER_ID] ?? [];
const badgeView = containerViews.find(view => view.id === BADGE_VIEW_ID);

describe('activity bar views', () => {
  it('contributes the welcome webview and the badge tree view', () => {
    expect(containerViews.map(view => view.id)).toEqual([WELCOME_VIEW_ID, BADGE_VIEW_ID]);
  });

  it('keeps the welcome view as a webview, since it renders custom HTML', () => {
    const welcomeView = containerViews.find(view => view.id === WELCOME_VIEW_ID);

    expect(welcomeView?.type).toBe('webview');
  });

  it('keeps the badge view as a tree view, so its badge can be set eagerly', () => {
    expect(badgeView).toBeDefined();
    // Any `type` here means a webview, which reintroduces the deferred
    // resolution that kept the badge hidden.
    expect(badgeView!.type).toBeUndefined();
  });

  it('starts the badge view collapsed so it does not crowd the welcome view', () => {
    expect(badgeView!.visibility).toBe('collapsed');
  });

  it('activates on any workspace containing a package.json', () => {
    // Without this the background check never runs until the user opens the
    // view, so the badge has nothing to show even once it has a carrier.
    expect(manifest.activationEvents).toContain('workspaceContains:**/package.json');
  });
});
