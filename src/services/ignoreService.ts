/**
 * Service to manage ignored/pinned packages
 * Persisted in .vscode/settings.json
 */

import * as vscode from 'vscode';

export interface IgnoredPackage {
  name: string;
  reason?: string;
  pinnedVersion?: string;
}

const SECTION = 'npm-visual-manager';
const SETTING_KEY = 'ignoredPackages';

export class IgnoreService {
  /**
   * Get a fresh configuration scoped to our extension section
   */
  private _getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SECTION);
  }

  /**
   * Get all ignored packages
   */
  getIgnoredPackages(): IgnoredPackage[] {
    return this._getConfig().get<IgnoredPackage[]>(SETTING_KEY, []);
  }

  /**
   * Check if a package is ignored
   */
  isIgnored(packageName: string): boolean {
    const ignored = this.getIgnoredPackages();
    return ignored.some(p => p.name === packageName);
  }

  /**
   * Get ignore reason for a package
   */
  getIgnoreReason(packageName: string): string | undefined {
    const ignored = this.getIgnoredPackages();
    const pkg = ignored.find(p => p.name === packageName);
    return pkg?.reason;
  }

  /**
   * Add a package to ignore list
   */
  async ignorePackage(packageName: string, reason?: string, pinnedVersion?: string): Promise<void> {
    const ignored = this.getIgnoredPackages();

    // Remove if already exists (to update)
    const filtered = ignored.filter(p => p.name !== packageName);

    // Add new entry
    filtered.push({
      name: packageName,
      reason,
      pinnedVersion,
    });

    await this._getConfig().update(SETTING_KEY, filtered, vscode.ConfigurationTarget.Workspace);
  }

  /**
   * Remove a package from ignore list
   */
  async unignorePackage(packageName: string): Promise<void> {
    const ignored = this.getIgnoredPackages();
    const filtered = ignored.filter(p => p.name !== packageName);

    await this._getConfig().update(SETTING_KEY, filtered, vscode.ConfigurationTarget.Workspace);
  }

  /**
   * Toggle ignore status for a package
   */
  async toggleIgnore(packageName: string, currentVersion?: string): Promise<boolean> {
    if (this.isIgnored(packageName)) {
      await this.unignorePackage(packageName);
      return false;
    } else {
      await this.ignorePackage(packageName, undefined, currentVersion);
      return true;
    }
  }
}

// Global instance
let ignoreServiceInstance: IgnoreService | null = null;

export function getIgnoreService(): IgnoreService {
  if (!ignoreServiceInstance) {
    ignoreServiceInstance = new IgnoreService();
  }
  return ignoreServiceInstance;
}
