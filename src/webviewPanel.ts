/**
 * Webview Panel handler for NPM Visual Manager
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Dependency, WebviewToHostMessage, HostToWebviewMessage, ColumnConfig, UpdateHistory } from './types';
import { findPackageJson, readPackageJson, extractDependencies } from './packageService';
import { getPackageDetails, isUpdateAvailable, getSemverUpdateType } from './npmService';
import { findAllProjects, Project } from './workspaceService';
import { runAudit, hasVulnerabilities, getPackageVulnerabilityCount, detectPackageManager } from './auditService';
import { getInstallCommand, getPackageManagerInfo, PackageManager } from './packageManagerService';
import { getVersions } from './nodeVersionService';

export class NpmGuiManagerPanel {
  public static currentPanel: NpmGuiManagerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _workspaceRoot: string;
  private _projects: Project[] = [];
  private _currentProjectPath: string;
  private _currentPackageManager: PackageManager = 'npm';
  private _updateHistory: UpdateHistory | null = null;

  public static async createOrShow(extensionUri: vscode.Uri, workspaceRoot: string): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Find all projects in workspace
    const projects = await findAllProjects(workspaceRoot);
    if (projects.length === 0) {
      vscode.window.showErrorMessage('npm-visual-manager: No package.json found in workspace');
      return;
    }

    // Si ya existe un panel, mostrarlo y actualizar proyectos
    if (NpmGuiManagerPanel.currentPanel) {
      NpmGuiManagerPanel.currentPanel._panel.reveal(column);
      NpmGuiManagerPanel.currentPanel._projects = projects;
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

    NpmGuiManagerPanel.currentPanel = new NpmGuiManagerPanel(panel, extensionUri, workspaceRoot, projects);
    await NpmGuiManagerPanel.currentPanel._loadDependencies();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspaceRoot: string,
    projects: Project[]
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._workspaceRoot = workspaceRoot;
    this._projects = projects;
    this._currentProjectPath = projects[0].path;

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

      case 'SELECT_PROJECT':
        await this._selectProject(message.path);
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

      case 'ROLLBACK_LAST':
        await this._rollbackLastUpdate();
        break;
    }
  }

  /**
   * Cambia el proyecto actual
   */
  private async _selectProject(projectPath: string): Promise<void> {
    this._currentProjectPath = projectPath;
    await this._loadDependencies();
  }

  /**
   * Muestra un quick pick para seleccionar proyecto
   */
  public async showProjectPicker(): Promise<void> {
    const items = this._projects.map(p => ({
      label: p.name,
      description: p.relativePath,
      path: p.path
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a project to manage dependencies'
    });

    if (selected) {
      await this._selectProject(selected.path);
    }
  }

  /**
   * Carga las dependencias del package.json del proyecto actual
   */
  private async _loadDependencies(): Promise<void> {
    try {
      const packageJsonPath = await findPackageJson(this._currentProjectPath);

      if (!packageJsonPath) {
        this._sendMessage({
          type: 'ERROR',
          message: 'No package.json found in the selected project'
        });
        return;
      }

      const packageJson = await readPackageJson(packageJsonPath);
      let dependencies = extractDependencies(packageJson, this._currentProjectPath);
      const columnConfig = this._getColumnConfig();
      
      // Detect package manager for this project
      this._currentPackageManager = await detectPackageManager(this._currentProjectPath);

      // Run security audit (silently)
      try {
        const auditResult = await runAudit(this._currentProjectPath);
        
        // Add vulnerability info to dependencies
        dependencies = dependencies.map(dep => ({
          ...dep,
          hasVulnerabilities: hasVulnerabilities(auditResult, dep.name),
          vulnerabilityCount: getPackageVulnerabilityCount(auditResult, dep.name)
        }));
      } catch (auditError) {
        console.warn('npm audit failed:', auditError);
        // Continue without audit data
      }

      // Get current project name - show only project name, not path
      const currentProject = this._projects.find(p => p.path === this._currentProjectPath);
      const displayName = currentProject ? currentProject.name : (packageJson.name || 'Unnamed Package');

      // Get Node and package manager versions
      const versions = await getVersions(this._currentPackageManager);

      this._sendMessage({
        type: 'DEPENDENCIES_DATA',
        dependencies,
        packageName: displayName,
        columnConfig,
        projects: this._projects.map(p => ({ name: p.name, path: p.path, relativePath: p.relativePath })),
        currentProjectPath: this._currentProjectPath,
        packageManager: this._currentPackageManager,
        versions,
        lastUpdate: this._updateHistory
      });

      // Update panel title with project name
      const projectName = currentProject?.name || packageJson.name || 'NPM Package Manager';
      this._panel.title = `NPM: ${projectName}`;

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
   * Get column visibility configuration
   */
  private _getColumnConfig(): ColumnConfig {
    const config = vscode.workspace.getConfiguration('npm-visual-manager.columns');
    return {
      size: config.get('size', true),
      type: config.get('type', true),
      lastUpdate: config.get('lastUpdate', true),
      security: config.get('security', true),
      semverUpdate: config.get('semverUpdate', true)
    };
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

    // Save to history before updating
    if (currentVersion) {
      this._updateHistory = {
        timestamp: Date.now(),
        packages: [{
          name: packageName,
          previousVersion: currentVersion,
          newVersion: version
        }]
      };
    }

    this._sendMessage({
      type: 'PROGRESS',
      message: `Installing ${packageName}@${version}...`
    });

    try {
      // Use detected package manager
      const installCmd = getInstallCommand(this._currentPackageManager, packageName, version);
      const terminal = this._getOrCreateTerminal();
      terminal.show();
      
      // Send cd command first (works on all platforms)
      terminal.sendText(`cd "${this._currentProjectPath}"`, true);
      // Then send install command
      terminal.sendText(installCmd, true);

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
      this._updateHistory = null; // Clear history on error
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
  private async _updateAllPackages(packages: { name: string; version: string; currentVersion?: string }[]): Promise<void> {
    if (packages.length === 0) {
      vscode.window.showInformationMessage('No packages to update');
      return;
    }

    const packageList = packages.map(p => `${p.name}@${p.version}`).join(' ');

    // Save to history before updating
    this._updateHistory = {
      timestamp: Date.now(),
      packages: packages
        .filter(p => p.currentVersion)
        .map(p => ({
          name: p.name,
          previousVersion: p.currentVersion!,
          newVersion: p.version
        }))
    };

    this._sendMessage({
      type: 'PROGRESS',
      message: `Installing ${packages.length} package(s)...`
    });

    try {
      // Use detected package manager
      const info = getPackageManagerInfo(this._currentPackageManager);
      const terminal = this._getOrCreateTerminal();
      terminal.show();
      
      // Send cd command first (works on all platforms)
      terminal.sendText(`cd "${this._currentProjectPath}"`, true);
      // Then send install command
      terminal.sendText(`${info.addCommand} ${packageList}`, true);

      setTimeout(async () => {
        await this._loadDependencies();
      }, 5000);

      vscode.window.showInformationMessage(`Updating ${packages.length} package(s)...`);
    } catch (error) {
      this._updateHistory = null; // Clear history on error
      vscode.window.showErrorMessage(`Failed to update packages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Rollback the last update operation
   */
  private async _rollbackLastUpdate(): Promise<void> {
    if (!this._updateHistory || this._updateHistory.packages.length === 0) {
      this._sendMessage({
        type: 'ROLLBACK_RESULT',
        success: false,
        message: 'No previous update to rollback'
      });
      return;
    }

    const packagesToRollback = this._updateHistory.packages;
    const packageList = packagesToRollback.map(p => `${p.name}@${p.previousVersion}`).join(', ');
    
    const result = await vscode.window.showWarningMessage(
      `Rollback ${packagesToRollback.length} package(s) to previous versions?\n\n${packageList}`,
      { modal: true },
      'Rollback',
      'Cancel'
    );

    if (result !== 'Rollback') {
      return;
    }

    this._sendMessage({
      type: 'PROGRESS',
      message: `Rolling back ${packagesToRollback.length} package(s)...`
    });

    try {
      const info = getPackageManagerInfo(this._currentPackageManager);
      const terminal = this._getOrCreateTerminal();
      terminal.show();
      
      // Install previous versions
      const installArgs = packagesToRollback.map(p => `${p.name}@${p.previousVersion}`).join(' ');
      
      // Send cd command first (works on all platforms)
      terminal.sendText(`cd "${this._currentProjectPath}"`, true);
      // Then send install command
      terminal.sendText(`${info.addCommand} ${installArgs}`, true);

      // Clear history after successful rollback
      const rolledBackPackages = packagesToRollback.map(p => p.name);
      this._updateHistory = null;

      setTimeout(async () => {
        await this._loadDependencies();
      }, 5000);

      this._sendMessage({
        type: 'ROLLBACK_RESULT',
        success: true,
        message: `Successfully rolled back ${packagesToRollback.length} package(s)`,
        rolledBackPackages
      });
    } catch (error) {
      this._sendMessage({
        type: 'ROLLBACK_RESULT',
        success: false,
        message: `Failed to rollback: ${error instanceof Error ? error.message : String(error)}`
      });
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; connect-src https:;">
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
