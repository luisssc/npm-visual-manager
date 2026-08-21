/**
 * Carrier for the activity bar badge, plus a one-line summary of the workspace
 * state.
 *
 * This exists as a separate tree view for a concrete API reason: a badge can
 * only be set on a live `TreeView` or `WebviewView` object. `createTreeView`
 * hands one over during activation, whereas a `WebviewView` is only created
 * when `resolveWebviewView` runs — which VS Code defers until the view first
 * becomes visible. Since the whole point of the badge is to report pending
 * updates *without* the user opening anything, the badge cannot live on the
 * welcome webview (see `sidebarProvider.ts`).
 */

import * as vscode from 'vscode';
import { getVSCodeLanguage } from '../i18n/getLanguage';
import { getTranslations } from '../i18n';

export interface UpdatesProjectSummary {
  name: string;
  path: string;
  relativePath: string;
  updates: number;
  vulnerablePackages: number;
}

export interface UpdatesSummary {
  updates: number;
  vulnerablePackages: number;
  /** Per package.json breakdown of the totals, when available */
  projects?: UpdatesProjectSummary[];
}

/** Windows paths are shown with forward slashes, like the rest of the UI. */
function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

export class UpdatesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  public static readonly viewType = 'npm-visual-manager.updates';

  private readonly _treeView: vscode.TreeView<vscode.TreeItem>;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _summary: UpdatesSummary | undefined;

  constructor() {
    this._treeView = vscode.window.createTreeView(UpdatesViewProvider.viewType, {
      treeDataProvider: this,
    });
    // The name in package.json can only be localized with `package.nls.*.json`
    // files, which VS Code requires in the extension root — nine files for one
    // word. Overriding the title here reuses the existing i18n layer instead.
    this._treeView.title = getTranslations(getVSCodeLanguage()).sidebar.updatesTitle;
  }

  /**
   * Publish the workspace summary. Drives both the badge and the view's row.
   * Pass undefined when the count is unknown (no workspace, badge disabled, or
   * the background check failed).
   */
  public setSummary(summary: UpdatesSummary | undefined): void {
    this._summary = summary;
    this._treeView.badge =
      summary && summary.updates > 0 ? { value: summary.updates, tooltip: this._summaryLabel(summary) } : undefined;
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): vscode.TreeItem[] {
    const t = getTranslations(getVSCodeLanguage());

    // Without a summary the view would be blank, so fall back to a row that at
    // least opens the manager.
    const item = this._summary
      ? new vscode.TreeItem(this._summaryLabel(this._summary))
      : new vscode.TreeItem(t.sidebar.openButton);

    item.iconPath = new vscode.ThemeIcon(
      this._summary === undefined ? 'package' : this._summary.updates > 0 ? 'arrow-circle-up' : 'check'
    );
    item.command = {
      command: 'npm-visual-manager.openManager',
      title: t.sidebar.openButton,
    };

    return [item, ...this._projectRows()];
  }

  /**
   * One row per package.json that needs attention. Without this the totals say
   * "40 updates" while the panel only ever shows one project's worth of them,
   * and nothing tells the user which file the rest belong to.
   * Rows are only added when more than one project was discovered.
   */
  private _projectRows(): vscode.TreeItem[] {
    const projects = this._summary?.projects;
    if (!projects || projects.length < 2) {
      return [];
    }

    return projects
      .filter(project => project.updates > 0 || project.vulnerablePackages > 0)
      .sort((a, b) => b.updates - a.updates || b.vulnerablePackages - a.vulnerablePackages)
      .map(project => {
        const label =
          project.relativePath === '.' ? 'package.json' : `${toPosixPath(project.relativePath)}/package.json`;
        const row = new vscode.TreeItem(label);
        row.description = this._summaryLabel(project);
        row.tooltip = `${project.name}\n${project.path}`;
        row.iconPath = new vscode.ThemeIcon(project.updates > 0 ? 'arrow-circle-up' : 'shield');
        // Opening with the project folder as the resource makes the panel focus
        // that package.json instead of the first one discovered.
        row.command = {
          command: 'npm-visual-manager.openManager',
          title: label,
          arguments: [vscode.Uri.file(project.path)],
        };
        return row;
      });
  }

  private _summaryLabel(summary: UpdatesSummary): string {
    const t = getTranslations(getVSCodeLanguage());
    return t.sidebar.badgeTooltip
      .replace('{updates}', String(summary.updates))
      .replace('{vulnerable}', String(summary.vulnerablePackages));
  }

  public dispose(): void {
    this._onDidChangeTreeData.dispose();
    this._treeView.dispose();
  }
}
