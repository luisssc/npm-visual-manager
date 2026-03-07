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
import { runAudit, hasVulnerabilities, getPackageVulnerabilityCount, detectPackageManager, clearAuditCache } from '../services/auditService';
import { getInstallCommand, getPackageManagerInfo, getUninstallCommand, PackageManager } from '../services/packageManagerService';
import { getVersions } from '../services/nodeVersionService';
import { getInstalledVersion, getInstalledVersions } from '../services/installedVersionService';
import { clearPackageSizeCache } from '../services/sizeService';
import { searchPackages, SearchResult } from '../services/searchService';
import { runCommand } from '../utils/commandRunner';
import { getNonce } from '../utils/nonce';

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

  public static async createOrShow(
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri,
    workspaceRoot: string,
    preferredProjectPath?: string
  ): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Find all projects in workspace
    const discoveredProjects = await findAllProjects(workspaceRoot);
    const projects = await NpmGuiManagerPanel._withPreferredProject(
      discoveredProjects,
      workspaceRoot,
      preferredProjectPath
    );
    if (projects.length === 0) {
      vscode.window.showErrorMessage('npm-visual-manager: No package.json found in workspace');
      return;
    }

    // If panel already exists, show it and update projects
    if (NpmGuiManagerPanel.currentPanel) {
      NpmGuiManagerPanel.currentPanel._panel.reveal(column);
      NpmGuiManagerPanel.currentPanel._projects = projects;
      // Force refresh HTML to avoid stale cached webview assets.
      NpmGuiManagerPanel.currentPanel._update();
      const currentPath = NpmGuiManagerPanel.currentPanel._currentProjectPath;
      const keepCurrent = projects.some(
        (project) =>
          NpmGuiManagerPanel._normalizePath(project.path) ===
          NpmGuiManagerPanel._normalizePath(currentPath)
      );
      const resolvedProjectPath = preferredProjectPath
        ? NpmGuiManagerPanel._resolveProjectPath(projects, preferredProjectPath)
        : (keepCurrent ? currentPath : projects[0].path);
      if (NpmGuiManagerPanel.currentPanel._currentProjectPath !== resolvedProjectPath) {
        await NpmGuiManagerPanel.currentPanel._selectProject(resolvedProjectPath);
      } else {
        await NpmGuiManagerPanel.currentPanel._loadDependencies();
      }
      return;
    }

    // Create new panel
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

    // Set theme-aware icons
    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-dark.svg')
    };

    NpmGuiManagerPanel.currentPanel = new NpmGuiManagerPanel(
      panel,
      extensionUri,
      globalStorageUri,
      workspaceRoot,
      projects,
      preferredProjectPath
    );
    await NpmGuiManagerPanel.currentPanel._loadDependencies();
  }

  private static _normalizePath(inputPath: string): string {
    return path.resolve(inputPath).replace(/[\\/]+$/, '').toLowerCase();
  }

  private static async _withPreferredProject(
    projects: Project[],
    workspaceRoot: string,
    preferredProjectPath?: string
  ): Promise<Project[]> {
    if (!preferredProjectPath) {
      return projects;
    }

    let candidatePath = preferredProjectPath;
    try {
      const stat = await fs.promises.stat(preferredProjectPath);
      if (stat.isFile()) {
        candidatePath = path.dirname(preferredProjectPath);
      }
    } catch {
      return projects;
    }

    const normalizedCandidate = this._normalizePath(candidatePath);
    const alreadyIncluded = projects.some(
      (project) => this._normalizePath(project.path) === normalizedCandidate
    );
    if (alreadyIncluded) {
      return projects;
    }

    const packageJsonPath = path.join(candidatePath, 'package.json');
    try {
      await fs.promises.access(packageJsonPath, fs.constants.F_OK);
    } catch {
      return projects;
    }

    let name = path.basename(candidatePath);
    try {
      const packageJson = await readPackageJson(packageJsonPath);
      if (packageJson.name) {
        name = packageJson.name;
      }
    } catch {
      // Keep folder name fallback
    }

    const relativePath = path.relative(workspaceRoot, candidatePath) || '.';
    return [
      ...projects,
      {
        name,
        path: candidatePath,
        relativePath
      }
    ];
  }

  private static _resolveProjectPath(projects: Project[], preferredProjectPath?: string): string {
    if (!preferredProjectPath) {
      return projects[0].path;
    }

    const normalizedPreferred = this._normalizePath(preferredProjectPath);
    const exactMatch = projects.find(
      (project) => this._normalizePath(project.path) === normalizedPreferred
    );
    if (exactMatch) {
      return exactMatch.path;
    }

    const containerMatch = projects
      .filter((project) => {
        const normalizedProject = this._normalizePath(project.path);
        return (
          normalizedPreferred === normalizedProject ||
          normalizedPreferred.startsWith(`${normalizedProject}${path.sep}`) ||
          normalizedPreferred.startsWith(`${normalizedProject}/`) ||
          normalizedPreferred.startsWith(`${normalizedProject}\\`)
        );
      })
      .sort((a, b) => b.path.length - a.path.length)[0];

    if (containerMatch) {
      return containerMatch.path;
    }

    return projects[0].path;
  }

  private _globalStorageUri: vscode.Uri;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri,
    workspaceRoot: string,
    projects: Project[],
    preferredProjectPath?: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._globalStorageUri = globalStorageUri;
    this._workspaceRoot = workspaceRoot;
    this._projects = projects;
    this._currentProjectPath = NpmGuiManagerPanel._resolveProjectPath(projects, preferredProjectPath);
    
    // Initialize cache for this project
    this._initializeCache();

    // Listen for messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message: WebviewToHostMessage) => {
        await this._handleMessage(message);
      },
      null,
      this._disposables
    );

    // Set initial HTML content
    this._update();

    // Clean up when panel is closed
    this._panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables
    );
  }

  /**
   * Handles messages received from the Webview
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



      case 'SEARCH_PACKAGES':
        await this._searchPackages(message.query);
        break;

      case 'INSTALL_NEW_PACKAGE':
        await this._installNewPackage(message.packageName, message.version, message.isDev);
        break;

      case 'OPEN_EXTERNAL':
        // Open in VS Code's simple browser (built-in)
        await vscode.commands.executeCommand('simpleBrowser.show', message.url);
        break;

      case 'UNINSTALL_PACKAGE':
        await this._uninstallPackage(message.packageName);
        break;
    }
  }

  /**
   * Initialize cache for the current project
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

    clearAuditCache(this._currentProjectPath);
    clearPackageSizeCache(this._currentProjectPath);
    
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
   * Show a quick pick to select project
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
   * Load dependencies from the current project's package.json
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
      const columnConfig = this._getColumnConfig();
      let dependencies = await extractDependencies(packageJson, this._currentProjectPath, {
        includeSize: columnConfig.size,
        concurrency: 10
      });
      
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

      // Start checking updates in parallel
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
   * Check available updates for dependencies
   */
  private async _checkUpdates(dependencies: Dependency[], forceRefresh: boolean = false): Promise<void> {
    const batchSize = 5; // Process in batches to avoid overloading
    const dependenciesToCheck = Array.from(
      new Map(
        dependencies
          .filter(dep => !dep.isIgnored)
          .map(dep => [dep.name, dep] as const)
      ).values()
    );

    for (let i = 0; i < dependenciesToCheck.length; i += batchSize) {
      const batch = dependenciesToCheck.slice(i, i + batchSize);
      const promises = batch.map(async (dep) => {
        try {
          const details = await getPackageDetails(dep.name, forceRefresh);
          // Compare declared version (from package.json) with latest, not installed version
          const semverUpdateType = getSemverUpdateType(dep.declaredVersion, details.latestVersion);
          
          this._sendMessage({
            type: 'VERSION_CHECK_RESULT',
            dependency: dep,
            latestVersion: details.latestVersion,
            semverUpdateType,
            lastPublishDate: details.lastPublishDate,
            fromCache: details.fromCache,
            cacheAge: details.cacheAge,
            isDeprecated: details.isDeprecated,
            deprecationMessage: details.deprecationMessage,
            repositoryUrl: details.repositoryUrl
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
   * Update a specific package
   */
  private async _updatePackage(packageName: string, version: string, currentVersion?: string): Promise<void> {
    // Get exact installed version from node_modules before updating
    const exactVersion = await getInstalledVersion(this._currentProjectPath, packageName);
    
    // Save to history before updating (use declared version for rollback)
    if (currentVersion) {
      this._updateHistory = {
        timestamp: Date.now(),
        packages: [{
          name: packageName,
          previousDeclaredVersion: currentVersion,     // e.g. "^5"
          previousInstalledVersion: exactVersion || currentVersion, // e.g. "5.9.3"
          newVersion: version
        }]
      };
    }

    this._sendMessage({
      type: 'PROGRESS',
      message: `Installing ${packageName}@${version}...`
    });

    try {
      const installCmd = getInstallCommand(this._currentPackageManager, packageName, version);

      const result = await runCommand(installCmd, {
        cwd: this._currentProjectPath,
        label: `Update ${packageName}@${version}`
      });

      clearAuditCache(this._currentProjectPath);
      await this._loadDependencies();

      this._sendMessage({
        type: 'UPDATE_RESULT',
        success: result.exitCode === 0,
        packageName,
        message: result.exitCode === 0
          ? `Successfully updated ${packageName}`
          : `Update finished with exit code ${result.exitCode}`
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
   * Update multiple packages at once
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
          previousDeclaredVersion: p.currentVersion!,  // e.g. "^5"
          previousInstalledVersion: installedVersions.get(p.name) || p.currentVersion!,
          newVersion: p.version
        }))
    };

    this._sendMessage({
      type: 'PROGRESS',
      message: `Updating ${packages.length} package(s)...`
    });

    try {
      const info = getPackageManagerInfo(this._currentPackageManager);
      const command = `${info.addCommand} ${packageList}`;

      const result = await runCommand(command, {
        cwd: this._currentProjectPath,
        label: `Update ${packages.length} package(s)`
      });

      clearAuditCache(this._currentProjectPath);
      await this._loadDependencies();

      this._sendMessage({
        type: 'UPDATE_RESULT',
        success: result.exitCode === 0,
        packageName: packages.map(p => p.name).join(', '),
        message: result.exitCode === 0
          ? `Successfully updated ${packages.length} package(s)`
          : `Update finished with exit code ${result.exitCode}`
      });
    } catch (error) {
      this._updateHistory = null; // Clear history on error
      this._sendMessage({
        type: 'UPDATE_RESULT',
        success: false,
        packageName: packages.map(p => p.name).join(', '),
        message: `Failed to update packages: ${error instanceof Error ? error.message : String(error)}`
      });
      vscode.window.showErrorMessage(`Failed to update packages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search packages in npm registry
   */
  private async _searchPackages(query: string): Promise<void> {
    try {
      this._sendMessage({
        type: 'PROGRESS',
        message: `Searching for "${query}"...`
      });
      
      const results = await searchPackages(query, 20);
      
      this._sendMessage({
        type: 'SEARCH_RESULTS',
        results
      });
      
      this._sendMessage({
        type: 'PROGRESS',
        message: null as any
      });
    } catch (error) {
      console.error('Search failed:', error);
      this._sendMessage({
        type: 'SEARCH_RESULTS',
        results: []
      });
      vscode.window.showErrorMessage(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Uninstall a package
   */
  private async _uninstallPackage(packageName: string): Promise<void> {
    try {
      const uninstallCmd = getUninstallCommand(this._currentPackageManager, packageName);

      this._sendMessage({
        type: 'PROGRESS',
        message: `Uninstalling ${packageName}...`
      });

      const result = await runCommand(uninstallCmd, {
        cwd: this._currentProjectPath,
        label: `Uninstall ${packageName}`
      });

      await this._loadDependencies();

      this._sendMessage({
        type: 'UNINSTALL_RESULT',
        packageName,
        success: result.exitCode === 0,
        message: result.exitCode === 0
          ? `Successfully uninstalled ${packageName}`
          : `Uninstall finished with exit code ${result.exitCode}`
      });
    } catch (error) {
      this._sendMessage({
        type: 'UNINSTALL_RESULT',
        packageName,
        success: false,
        message: `Failed to uninstall ${packageName}: ${error instanceof Error ? error.message : String(error)}`
      });
      vscode.window.showErrorMessage(`Failed to uninstall package: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Install a new package
   */
  private async _installNewPackage(packageName: string, version: string, isDev: boolean): Promise<void> {
    try {
      const info = getPackageManagerInfo(this._currentPackageManager);
      const devFlag = isDev ? info.devFlag || '--save-dev' : '';
      const versionSuffix = version ? `@${version}` : '';
      const command = `${info.addCommand} ${packageName}${versionSuffix} ${devFlag}`.trim();

      this._sendMessage({
        type: 'PROGRESS',
        message: `Installing ${packageName}...`
      });

      const result = await runCommand(command, {
        cwd: this._currentProjectPath,
        label: `Install ${packageName}${versionSuffix}`
      });

      await this._loadDependencies();

      this._sendMessage({
        type: 'UPDATE_RESULT',
        success: result.exitCode === 0,
        packageName,
        message: result.exitCode === 0
          ? `Successfully installed ${packageName}`
          : `Install finished with exit code ${result.exitCode}`
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to install package: ${error instanceof Error ? error.message : String(error)}`);
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
      
      // Install using the EXACT installed version to get the right package
      // We'll restore the declared version in package.json after
      const installArgs = packagesToRollback
        .map(p => `"${p.name}@${p.previousInstalledVersion}"`)
        .join(' ');
      const command = `${info.addCommand} ${installArgs}`;

      await runCommand(command, {
        cwd: this._currentProjectPath,
        label: `Rollback ${packagesToRollback.length} package(s)`
      });

      clearAuditCache(this._currentProjectPath);
      await this._restorePackageJsonVersions(packagesToRollback);
      await this._loadDependencies();

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
   * Send a message to the Webview
   */
  private _sendMessage(message: HostToWebviewMessage): void {
    this._panel.webview.postMessage(message);
  }

  /**
   * Update the Webview HTML content
   */
  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  /**
   * Generate the HTML for the Webview
   */
  private _getHtmlForWebview(): string {
    const webview = this._panel.webview;
    const scriptPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.js');
    const cssPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.css');

    const scriptUri = webview.asWebviewUri(scriptPath);
    const cssUri = webview.asWebviewUri(cssPath);
    const cacheBuster = Date.now();

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; connect-src https:;">
  <title>NPM Package Manager</title>
  <link rel="stylesheet" href="${cssUri}?v=${cacheBuster}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}?v=${cacheBuster}"></script>
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


