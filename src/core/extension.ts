/**
 * Main entry point for npm-visual-manager extension
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { NpmGuiManagerPanel } from './webviewPanel';
import { setGlobalStorageUri } from '../services/cacheService';
import { NpmDependenciesProvider } from './sidebarProvider';
import { computeWorkspaceBadge } from '../services/badgeService';
import { getIgnoreService } from '../services/ignoreService';
import { getVSCodeLanguage } from '../i18n/getLanguage';
import { getTranslations } from '../i18n';

const BADGE_REFRESH_DEBOUNCE_MS = 3000;

function isBadgeEnabled(): boolean {
  return vscode.workspace.getConfiguration('npm-visual-manager').get<boolean>('badge.enabled', true);
}

/**
 * Compute update/vulnerability counts for the workspace and reflect them
 * on the activity bar badge. Serialized: if a refresh is requested while
 * another is running, one extra run is queued.
 */
class BadgeController {
  private _refreshing = false;
  private _pending = false;
  private _debounceTimer: NodeJS.Timeout | undefined;

  constructor(private readonly _provider: NpmDependenciesProvider) {}

  requestRefresh(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => void this.refresh(), BADGE_REFRESH_DEBOUNCE_MS);
  }

  async refresh(): Promise<void> {
    if (this._refreshing) {
      this._pending = true;
      return;
    }
    this._refreshing = true;

    try {
      if (!isBadgeEnabled()) {
        this._provider.setBadge(undefined);
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        this._provider.setBadge(undefined);
        return;
      }

      const roots = workspaceFolders.map(f => f.uri.fsPath);
      const ignoreService = getIgnoreService();
      const summary = await computeWorkspaceBadge(roots, {
        isIgnored: name => ignoreService.isIgnored(name),
      });

      // Badge number counts available updates only; vulnerabilities are
      // detailed in the tooltip so the count matches what the table shows.
      if (summary.updates === 0) {
        this._provider.setBadge(undefined);
        return;
      }

      const t = getTranslations(getVSCodeLanguage());
      const tooltip = t.sidebar.badgeTooltip
        .replace('{updates}', String(summary.updates))
        .replace('{vulnerable}', String(summary.vulnerablePackages));

      this._provider.setBadge({ value: summary.updates, tooltip });
    } catch (error) {
      console.warn('[npm-visual-manager] Badge refresh failed:', error);
    } finally {
      this._refreshing = false;
      if (this._pending) {
        this._pending = false;
        void this.refresh();
      }
    }
  }

  dispose(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('npm-visual-manager extension is now active');

  // Set global storage URI for cache service
  setGlobalStorageUri(context.globalStorageUri);

  // Register the main command (opens in panel)
  const openManagerCommand = vscode.commands.registerCommand(
    'npm-visual-manager.openManager',
    async (resource?: vscode.Uri) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
          'npm-visual-manager: No workspace folder is open. Please open a folder containing a package.json file.'
        );
        return;
      }

      // Collect all workspace folder paths for multi-root workspace support
      const allWorkspaceRoots = workspaceFolders.map(f => f.uri.fsPath);
      let preferredProjectPath: string | undefined;

      const activeUri = resource || vscode.window.activeTextEditor?.document.uri;
      if (activeUri && activeUri.scheme === 'file') {
        const isPackageJson = path.basename(activeUri.fsPath).toLowerCase() === 'package.json';
        preferredProjectPath = isPackageJson ? path.dirname(activeUri.fsPath) : activeUri.fsPath;
      }

      try {
        await NpmGuiManagerPanel.createOrShow(
          context.extensionUri,
          context.globalStorageUri,
          allWorkspaceRoots,
          preferredProjectPath
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `npm-visual-manager: Failed to open manager - ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Register refresh command
  const refreshCommand = vscode.commands.registerCommand('npm-visual-manager.refresh', async () => {
    vscode.window.showInformationMessage('Refreshing dependencies...');
    vscode.commands.executeCommand('npm-visual-manager.openManager');
  });

  // Register sidebar webview provider
  const sidebarProvider = new NpmDependenciesProvider();
  const sidebarDisposable = vscode.window.registerWebviewViewProvider('npm-visual-manager.sidebar', sidebarProvider, {
    webviewOptions: {
      retainContextWhenHidden: true,
    },
  });

  // Activity bar badge: background check of updates/vulnerabilities
  const badgeController = new BadgeController(sidebarProvider);
  void badgeController.refresh();

  // Re-check when any project package.json changes (ignoring node_modules)
  const badgeWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');
  const onPackageJsonChange = (uri: vscode.Uri) => {
    if (uri.fsPath.split(path.sep).includes('node_modules')) {
      return;
    }
    badgeController.requestRefresh();
  };
  badgeWatcher.onDidChange(onPackageJsonChange);
  badgeWatcher.onDidCreate(onPackageJsonChange);
  badgeWatcher.onDidDelete(onPackageJsonChange);

  // Re-check when badge setting or ignore list changes
  const configListener = vscode.workspace.onDidChangeConfiguration(event => {
    if (
      event.affectsConfiguration('npm-visual-manager.badge.enabled') ||
      event.affectsConfiguration('npm-visual-manager.ignoredPackages')
    ) {
      void badgeController.refresh();
    }
  });

  context.subscriptions.push(openManagerCommand);
  context.subscriptions.push(refreshCommand);
  context.subscriptions.push(sidebarDisposable);
  context.subscriptions.push(badgeWatcher);
  context.subscriptions.push(configListener);
  context.subscriptions.push({ dispose: () => badgeController.dispose() });
}

export function deactivate(): void {
  console.log('npm-visual-manager extension is now deactivated');
}
