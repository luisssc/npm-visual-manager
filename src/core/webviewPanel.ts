/**
 * Webview Panel handler for NPM Visual Manager
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Dependency, WebviewToHostMessage, HostToWebviewMessage, ColumnConfig, UpdateHistory } from './types';
import { findPackageJson, readPackageJson, extractDependencies } from '../services/packageService';
import { getPackageDetails, isUpdateAvailable, getSemverUpdateType, setGlobalCache } from '../services/npmService';
import { getCache, VersionCache } from '../services/cacheService';
import { getIgnoreService, IgnoreService } from '../services/ignoreService';
import { findAllProjects, Project } from '../services/workspaceService';
import { runAudit, hasVulnerabilities, getPackageVulnerabilityCount, detectPackageManager } from '../services/auditService';
import { getInstallCommand, getPackageManagerInfo, PackageManager } from '../services/packageManagerService';
import { getVersions } from '../services/nodeVersionService';
import { getInstalledVersion, getInstalledVersions } from '../services/installedVersionService';
import { readScripts, sortScripts, NpmScript } from '../services/scriptService';

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
  private _cache: VersionCache | null = null;

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
    
    // Initialize cache for this project
    this._initializeCache();

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
        await this._checkUpdates(message.dependencies, message.forceRefresh);
        break;

      case 'REFRESH_CACHE':
        await this._refreshCache();
        break;

      case 'TOGGLE_IGNORE_PACKAGE':
        await this._toggleIgnorePackage(message.packageName, message.currentVersion);
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

      case 'GET_SCRIPTS':
        await this._loadScripts();
        break;

      case 'RUN_SCRIPT':
        await this._runScript(message.scriptName);
        break;
    }
  }

  /**
   * Cambia el proyecto actual
   */
  private async _initializeCache(): Promise<void> {
    this._cache = getCache(this._currentProjectPath);
    await this._cache.load();
    setGlobalCache(this._cache);
  }

  private async _selectProject(projectPath: string): Promise<void> {
    this._currentProjectPath = projectPath;
    await this._initializeCache();
    await this._loadDependencies();
  }

  private async _refreshCache(): Promise<void> {
    if (this._cache) {
      this._cache.clear();
      await this._cache.save();
    }
    
    // Reload dependencies with fresh cache
    await this._loadDependencies();
    
    this._sendMessage({
      type: 'CACHE_CLEARED',
      message: 'Cache refreshed successfully'
    });
  }

  /**
   * Toggle ignore status for a package
   */
  private async _toggleIgnorePackage(packageName: string, currentVersion?: string): Promise<void> {
    const ignoreService = getIgnoreService();
    const isIgnored = await ignoreService.toggleIgnore(packageName, currentVersion);
    
    this._sendMessage({
      type: 'IGNORE_TOGGLED',
      packageName,
      isIgnored
    });
    
    // Reload to update UI
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
      let dependencies = await extractDependencies(packageJson, this._currentProjectPath);
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

      // Load ignored packages status
      try {
        dependencies = await this._loadIgnoredStatus(dependencies);
      } catch (ignoreError) {
        console.warn('Failed to load ignored status:', ignoreError);
        // Continue without ignore data
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

  private async _loadIgnoredStatus(dependencies: Dependency[]): Promise<Dependency[]> {
    const ignoreService = getIgnoreService();
    return dependencies.map(dep => ({
      ...dep,
      isIgnored: ignoreService.isIgnored(dep.name),
      ignoreReason: ignoreService.getIgnoreReason(dep.name)
    }));
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
  private async _checkUpdates(dependencies: Dependency[], forceRefresh: boolean = false): Promise<void> {
    const batchSize = 5; // Procesar en lotes para no saturar

    for (let i = 0; i < dependencies.length; i += batchSize) {
      const batch = dependencies.slice(i, i + batchSize);
      const promises = batch.map(async (dep) => {
        try {
          const details = await getPackageDetails(dep.name, forceRefresh);
          const semverUpdateType = getSemverUpdateType(dep.installedVersion, details.latestVersion);
          
          this._sendMessage({
            type: 'VERSION_CHECK_RESULT',
            dependency: dep,
            latestVersion: details.latestVersion,
            semverUpdateType,
            lastPublishDate: details.lastPublishDate,
            fromCache: details.fromCache,
            cacheAge: details.cacheAge,
            isDeprecated: details.isDeprecated,
            deprecationMessage: details.deprecationMessage
          });
        } catch (error) {
          console.warn(`Failed to check version for ${dep.name}:`, error);
        }
      });

      await Promise.all(promises);
    }

    // Save cache after batch processing
    if (this._cache) {
      await this._cache.save();
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

    // Get exact installed version from node_modules before updating
    const exactVersion = await getInstalledVersion(this._currentProjectPath, packageName);
    
    // Save to history before updating (use declared version for rollback)
    if (currentVersion) {
      this._updateHistory = {
        timestamp: Date.now(),
        packages: [{
          name: packageName,
          previousDeclaredVersion: currentVersion,     // ej: "^5"
          previousInstalledVersion: exactVersion || currentVersion, // ej: "5.9.3"
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

      // Wait for npm to finish and reload dependencies
      setTimeout(async () => {
        await this._loadDependencies();
      }, 5000);

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

    // Get exact installed versions from node_modules before updating
    const packageNames = packages.map(p => p.name);
    const installedVersions = await getInstalledVersions(this._currentProjectPath, packageNames);
    
    // Save to history before updating (use declared versions for rollback)
    this._updateHistory = {
      timestamp: Date.now(),
      packages: packages
        .filter(p => p.currentVersion)
        .map(p => ({
          name: p.name,
          previousDeclaredVersion: p.currentVersion!,  // ej: "^5"
          previousInstalledVersion: installedVersions.get(p.name) || p.currentVersion!,
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
      }, 8000);

      vscode.window.showInformationMessage(`Updating ${packages.length} package(s)...`);
    } catch (error) {
      this._updateHistory = null; // Clear history on error
      vscode.window.showErrorMessage(`Failed to update packages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load npm scripts from package.json
   */
  private async _loadScripts(): Promise<void> {
    try {
      const scripts = await readScripts(this._currentProjectPath);
      const sortedScripts = sortScripts(scripts);
      
      this._sendMessage({
        type: 'SCRIPTS_DATA',
        scripts: sortedScripts
      });
    } catch (error) {
      console.warn('Failed to load scripts:', error);
      this._sendMessage({
        type: 'SCRIPTS_DATA',
        scripts: []
      });
    }
  }

  /**
   * Run an npm script in the terminal
   */
  private async _runScript(scriptName: string): Promise<void> {
    try {
      const info = getPackageManagerInfo(this._currentPackageManager);
      const terminal = this._getOrCreateTerminal();
      terminal.show();
      
      // Send cd command first
      terminal.sendText(`cd "${this._currentProjectPath}"`, true);
      // Then send the script command
      terminal.sendText(`${info.runCommand} ${scriptName}`, true);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to run script: ${error instanceof Error ? error.message : String(error)}`);
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
    const packageList = packagesToRollback.map(p => `${p.name}@${p.previousDeclaredVersion}`).join(', ');
    
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
      
      // Install using the EXACT installed version to get the right package
      // We'll restore the declared version in package.json after
      const installArgs = packagesToRollback
        .map(p => `"${p.name}@${p.previousInstalledVersion}"`)
        .join(' ');
      
      // Send cd command first (works on all platforms)
      terminal.sendText(`cd "${this._currentProjectPath}"`, true);
      // Then send install command
      terminal.sendText(`${info.addCommand} ${installArgs}`, true);

      // Wait for npm to finish, then restore package.json with declared versions
      setTimeout(async () => {
        await this._restorePackageJsonVersions(packagesToRollback);
        await this._loadDependencies();
      }, 5000);

      // Clear history after successful rollback
      const rolledBackPackages = packagesToRollback.map(p => p.name);
      this._updateHistory = null;

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
   * Restore declared versions in package.json after rollback
   * This preserves the original format (^, ~, exact versions, etc.)
   */
  private async _restorePackageJsonVersions(
    packages: Array<{ name: string; previousDeclaredVersion: string; previousInstalledVersion: string; newVersion: string }>
  ): Promise<void> {
    try {
      const packageJsonPath = path.join(this._currentProjectPath, 'package.json');
      const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);

      for (const { name, previousDeclaredVersion } of packages) {
        // Find which dependency type this package is in
        if (pkg.dependencies && name in pkg.dependencies) {
          pkg.dependencies[name] = previousDeclaredVersion;
        } else if (pkg.devDependencies && name in pkg.devDependencies) {
          pkg.devDependencies[name] = previousDeclaredVersion;
        } else if (pkg.peerDependencies && name in pkg.peerDependencies) {
          pkg.peerDependencies[name] = previousDeclaredVersion;
        }
      }

      // Write back with proper formatting
      await fs.promises.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    } catch (error) {
      console.error('[npm-visual-manager] Failed to restore package.json versions:', error);
      // Don't throw - the rollback technically succeeded, just package.json wasn't restored
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
