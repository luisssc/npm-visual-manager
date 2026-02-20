/**
 * Sidebar webview provider for npm-visual-manager
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Dependency, WebviewToHostMessage, HostToWebviewMessage } from './types';
import { findPackageJson, readPackageJson, extractDependencies } from './packageService';
import { getLatestVersion, isUpdateAvailable } from './npmService';

export class NpmDependenciesProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'npm-visual-manager.sidebar';
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _workspaceRoot: string | undefined;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    this._workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'out', 'webview')
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      async (message: WebviewToHostMessage) => {
        await this._handleMessage(message);
      }
    );

    // Load dependencies when view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this._workspaceRoot) {
        this._loadDependencies();
      }
    });

    // Initial load
    if (this._workspaceRoot) {
      this._loadDependencies();
    }
  }

  private async _handleMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case 'GET_DEPENDENCIES':
        await this._loadDependencies();
        break;

      case 'CHECK_UPDATES':
        await this._checkUpdates(message.dependencies);
        break;

      case 'UPDATE_PACKAGE':
        await this._updatePackage(message.packageName, message.version);
        break;

      case 'UPDATE_ALL_PACKAGES':
        await this._updateAllPackages(message.packages);
        break;
    }
  }

  private async _loadDependencies(): Promise<void> {
    if (!this._workspaceRoot || !this._view) {
      this._sendMessage({
        type: 'ERROR',
        message: 'No workspace folder is open'
      });
      return;
    }

    try {
      const packageJsonPath = await findPackageJson(this._workspaceRoot);

      if (!packageJsonPath) {
        this._sendMessage({
          type: 'ERROR',
          message: 'No package.json found in the workspace root'
        });
        return;
      }

      const packageJson = await readPackageJson(packageJsonPath);
      const dependencies = extractDependencies(packageJson);

      this._sendMessage({
        type: 'DEPENDENCIES_DATA',
        dependencies,
        packageName: packageJson.name || 'Unnamed Package'
      });

      // Check for updates in parallel
      await this._checkUpdates(dependencies);
    } catch (error) {
      this._sendMessage({
        type: 'ERROR',
        message: `Failed to load dependencies: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  private async _checkUpdates(dependencies: Dependency[]): Promise<void> {
    const batchSize = 5;

    for (let i = 0; i < dependencies.length; i += batchSize) {
      const batch = dependencies.slice(i, i + batchSize);
      const promises = batch.map(async (dep) => {
        try {
          const latestVersion = await getLatestVersion(dep.name);
          this._sendMessage({
            type: 'VERSION_CHECK_RESULT',
            dependency: dep,
            latestVersion
          });
        } catch (error) {
          console.warn(`Failed to check version for ${dep.name}:`, error);
        }
      });

      await Promise.all(promises);
    }
  }

  private async _updatePackage(packageName: string, version: string): Promise<void> {
    this._sendMessage({
      type: 'PROGRESS',
      message: `Installing ${packageName}@${version}...`
    });

    try {
      const terminal = this._getOrCreateTerminal();
      terminal.show();
      terminal.sendText(`npm install ${packageName}@${version}`, true);

      setTimeout(async () => {
        await this._loadDependencies();
      }, 3000);

      this._sendMessage({
        type: 'UPDATE_RESULT',
        success: true,
        packageName,
        message: `Successfully initiated update for ${packageName}`
      });
    } catch (error) {
      this._sendMessage({
        type: 'UPDATE_RESULT',
        success: false,
        packageName,
        message: `Failed to update ${packageName}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  private async _updateAllPackages(packages: { name: string; version: string }[]): Promise<void> {
    if (packages.length === 0) {
      vscode.window.showInformationMessage('No packages to update');
      return;
    }

    const packageList = packages.map(p => `${p.name}@${p.version}`).join(' ');

    this._sendMessage({
      type: 'PROGRESS',
      message: `Installing ${packages.length} package(s)...`
    });

    try {
      const terminal = this._getOrCreateTerminal();
      terminal.show();
      terminal.sendText(`npm install ${packageList}`, true);

      setTimeout(async () => {
        await this._loadDependencies();
      }, 5000);

      vscode.window.showInformationMessage(`Updating ${packages.length} package(s)...`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update packages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private _getOrCreateTerminal(): vscode.Terminal {
    const terminalName = 'NPM Visual Manager';
    const existing = vscode.window.terminals.find(t => t.name === terminalName);
    return existing || vscode.window.createTerminal(terminalName);
  }

  private _sendMessage(message: HostToWebviewMessage): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.js');
    const cssPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.css');

    const scriptUri = webview.asWebviewUri(scriptPath);
    const cssUri = webview.asWebviewUri(cssPath);

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; connect-src https:;">
  <title>NPM Visual Manager</title>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
