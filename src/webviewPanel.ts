/**
 * Manejador del Webview Panel para NPM Visual Manager
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Dependency, WebviewToHostMessage, HostToWebviewMessage } from './types';
import { findPackageJson, readPackageJson, extractDependencies } from './packageService';
import { getPackageDetails, isUpdateAvailable, getSemverUpdateType, SemverUpdateType } from './npmService';

export class NpmGuiManagerPanel {
  public static currentPanel: NpmGuiManagerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _workspaceRoot: string;

  public static async createOrShow(extensionUri: vscode.Uri, workspaceRoot: string): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Si ya existe un panel, mostrarlo
    if (NpmGuiManagerPanel.currentPanel) {
      NpmGuiManagerPanel.currentPanel._panel.reveal(column);
      await NpmGuiManagerPanel.currentPanel._loadDependencies();
      return;
    }

    // Crear nuevo panel
    const panel = vscode.window.createWebviewPanel(
      'npmGuiManager',
      'NPM Package Manager',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'out', 'webview')
        ]
      }
    );

    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-dark.svg')
    };

    NpmGuiManagerPanel.currentPanel = new NpmGuiManagerPanel(panel, extensionUri, workspaceRoot);
    await NpmGuiManagerPanel.currentPanel._loadDependencies();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspaceRoot: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._workspaceRoot = workspaceRoot;

    // Configurar contenido HTML inicial
    this._update();

    // Escuchar mensajes del webview
    this._panel.webview.onDidReceiveMessage(
      async (message: WebviewToHostMessage) => {
        await this._handleMessage(message);
      },
      null,
      this._disposables
    );

    // Limpiar cuando se cierra
    this._panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables
    );
  }

  /**
   * Maneja los mensajes recibidos del Webview
   */
  private async _handleMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case 'GET_DEPENDENCIES':
        await this._loadDependencies();
        break;

      case 'CHECK_UPDATES':
        await this._checkUpdates(message.dependencies);
        break;

      case 'UPDATE_PACKAGE':
        await this._updatePackage(message.packageName, message.version, message.currentVersion);
        break;

      case 'UPDATE_ALL_PACKAGES':
        await this._updateAllPackages(message.packages);
        break;
    }
  }

  /**
   * Carga las dependencias del package.json
   */
  private async _loadDependencies(): Promise<void> {
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
      const dependencies = extractDependencies(packageJson, this._workspaceRoot);

      this._sendMessage({
        type: 'DEPENDENCIES_DATA',
        dependencies,
        packageName: packageJson.name || 'Unnamed Package'
      });

      // Iniciar verificación de actualizaciones en paralelo
      await this._checkUpdates(dependencies);
    } catch (error) {
      this._sendMessage({
        type: 'ERROR',
        message: `Failed to load dependencies: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * Verifica las actualizaciones disponibles para las dependencias
   */
  private async _checkUpdates(dependencies: Dependency[]): Promise<void> {
    const batchSize = 5; // Procesar en lotes para no saturar

    for (let i = 0; i < dependencies.length; i += batchSize) {
      const batch = dependencies.slice(i, i + batchSize);
      const promises = batch.map(async (dep) => {
        try {
          const details = await getPackageDetails(dep.name);
          const semverUpdateType = getSemverUpdateType(dep.installedVersion, details.latestVersion);
          
          this._sendMessage({
            type: 'VERSION_CHECK_RESULT',
            dependency: dep,
            latestVersion: details.latestVersion,
            semverUpdateType,
            lastPublishDate: details.lastPublishDate
          });
        } catch (error) {
          console.warn(`Failed to check version for ${dep.name}:`, error);
        }
      });

      await Promise.all(promises);
    }
  }

  /**
   * Actualiza un paquete específico
   */
  private async _updatePackage(packageName: string, version: string, currentVersion?: string): Promise<void> {
    // Show confirmation modal
    const message = currentVersion 
      ? `Update "${packageName}" from ${currentVersion} to ${version}?`
      : `Update "${packageName}" to ${version}?`;
    
    const result = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      'Update',
      'Cancel'
    );

    if (result !== 'Update') {
      return;
    }

    this._sendMessage({
      type: 'PROGRESS',
      message: `Installing ${packageName}@${version}...`
    });

    try {
      const terminal = this._getOrCreateTerminal();
      terminal.show();
      terminal.sendText(`npm install ${packageName}@${version}`, true);

      // Esperar un poco y recargar dependencias
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

  /**
   * Actualiza múltiples paquetes
   */
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

  /**
   * Obtiene o crea un terminal dedicado
   */
  private _getOrCreateTerminal(): vscode.Terminal {
    const terminalName = 'NPM Visual Manager';
    const existing = vscode.window.terminals.find(t => t.name === terminalName);
    return existing || vscode.window.createTerminal(terminalName);
  }

  /**
   * Envía un mensaje al Webview
   */
  private _sendMessage(message: HostToWebviewMessage): void {
    this._panel.webview.postMessage(message);
  }

  /**
   * Actualiza el contenido HTML del Webview
   */
  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  /**
   * Genera el HTML para el Webview
   */
  private _getHtmlForWebview(): string {
    const webview = this._panel.webview;
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
  <title>NPM Package Manager</title>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    NpmGuiManagerPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
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
