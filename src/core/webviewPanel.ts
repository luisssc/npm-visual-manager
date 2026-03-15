/**
 * Webview Panel handler for NPM Visual Manager
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { Dependency, WebviewToHostMessage, HostToWebviewMessage, ColumnConfig, UpdateHistory } from '../../types';
import { findPackageJson, readPackageJson, extractDependencies } from '../services/packageService';
import { getPackageDetails, getSemverUpdateType, setGlobalCache } from '../services/npmService';
import { getCache, VersionCache } from '../services/cacheService';
import { getIgnoreService } from '../services/ignoreService';
import { findAllProjects, Project } from '../services/workspaceService';
import {
  runAudit,
  hasVulnerabilities,
  getPackageVulnerabilityCount,
  detectPackageManager,
  clearAuditCache,
} from '../services/auditService';
import { getVersions } from '../services/nodeVersionService';
import { searchPackages } from '../services/searchService';
import { clearPackageSizeCache } from '../services/sizeService';
import { PackageManager } from '../services/packageManagerService';
import { getHtmlForWebview } from './htmlProvider';
import { getVSCodeLanguage } from '../i18n/getLanguage';
import { PackageOperationsService } from '../services/packageOperationsService';

export class NpmGuiManagerPanel {
  public static currentPanel: NpmGuiManagerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _projects: Project[] = [];
  private _currentProjectPath: string;
  private _currentPackageManager: PackageManager = 'npm';
  private _updateHistory: UpdateHistory | null = null;
  private _cache: VersionCache | null = null;
  private _packageOperationsService: PackageOperationsService;
  private _searchAbortController: AbortController | null = null;
  private _fileWatcher: vscode.FileSystemWatcher | undefined;
  private _fileWatcherDebounce: NodeJS.Timeout | undefined;

  public static async createOrShow(
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri,
    workspaceRoot: string,
    preferredProjectPath?: string
  ): Promise<void> {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

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
        project => NpmGuiManagerPanel._normalizePath(project.path) === NpmGuiManagerPanel._normalizePath(currentPath)
      );
      const resolvedProjectPath = preferredProjectPath
        ? NpmGuiManagerPanel._resolveProjectPath(projects, preferredProjectPath)
        : keepCurrent
          ? currentPath
          : projects[0]!.path;
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
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'webview')],
      }
    );

    // Set theme-aware icons
    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'resources', 'icon-dark.svg'),
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
    return path
      .resolve(inputPath)
      .replace(/[\\/]+$/, '')
      .toLowerCase();
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
    const alreadyIncluded = projects.some(project => this._normalizePath(project.path) === normalizedCandidate);
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
        relativePath,
      },
    ];
  }

  private static _resolveProjectPath(projects: Project[], preferredProjectPath?: string): string {
    if (!preferredProjectPath) {
      return projects[0]!.path;
    }

    const normalizedPreferred = this._normalizePath(preferredProjectPath);
    const exactMatch = projects.find(project => this._normalizePath(project.path) === normalizedPreferred);
    if (exactMatch) {
      return exactMatch.path;
    }

    const containerMatch = projects
      .filter(project => {
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

    return projects[0]!.path;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    _globalStorageUri: vscode.Uri,
    _workspaceRoot: string,
    projects: Project[],
    preferredProjectPath?: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    // _globalStorageUri and _workspaceRoot are reserved for future use
    this._projects = projects;
    this._currentProjectPath = NpmGuiManagerPanel._resolveProjectPath(projects, preferredProjectPath);

    // Initialize Package Operations Service
    this._packageOperationsService = new PackageOperationsService(
      msg => this._sendMessage(msg),
      () => this._loadDependencies(),
      history => {
        this._updateHistory = history;
      }
    );

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
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Initialize file watcher for package.json changes
    this._initFileWatcher();
  }

  private _initFileWatcher(): void {
    // Watch for package.json changes in the entire workspace
    this._fileWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');

    this._fileWatcher.onDidChange(uri => this._onFileChanged(uri), null, this._disposables);
    this._fileWatcher.onDidCreate(uri => this._onFileChanged(uri), null, this._disposables);
    this._fileWatcher.onDidDelete(uri => this._onFileChanged(uri), null, this._disposables);

    this._disposables.push(this._fileWatcher);
  }

  private _onFileChanged(uri: vscode.Uri): void {
    const changedPath = path.dirname(uri.fsPath);
    const normalizedChanged = NpmGuiManagerPanel._normalizePath(changedPath);
    const normalizedCurrent = NpmGuiManagerPanel._normalizePath(this._currentProjectPath);

    // Only reload if the changed package.json is in the current project
    if (normalizedChanged === normalizedCurrent) {
      if (this._fileWatcherDebounce) {
        clearTimeout(this._fileWatcherDebounce);
      }

      this._fileWatcherDebounce = setTimeout(() => {
        console.log('package.json changed, auto-refreshing...');
        this._loadDependencies();
      }, 500); // 500ms debounce
    }
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

      case 'UPDATE_PACKAGE': {
        await this._packageOperationsService.updatePackage(
          message.packageName,
          message.version,
          message.currentVersion,
          this._currentProjectPath,
          this._currentPackageManager
        );
        break;
      }

      case 'UPDATE_ALL_PACKAGES': {
        await this._packageOperationsService.updateAllPackages(
          message.packages,
          this._currentProjectPath,
          this._currentPackageManager
        );
        break;
      }

      case 'ROLLBACK_LAST':
        await this._packageOperationsService.rollbackLastUpdate(
          this._updateHistory,
          this._currentProjectPath,
          this._currentPackageManager
        );
        break;

      case 'SEARCH_PACKAGES':
        await this._searchPackages(message.query);
        break;

      case 'INSTALL_NEW_PACKAGE':
        await this._packageOperationsService.installNewPackage(
          message.packageName,
          message.version,
          message.isDev,
          this._currentProjectPath,
          this._currentPackageManager
        );
        break;

      case 'OPEN_EXTERNAL':
        // Always open in the system's default browser for maximum compatibility
        // (simpleBrowser.show uses iframes which are blocked by CSP on some sites like GitHub)
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;

      case 'UNINSTALL_PACKAGE':
        await this._packageOperationsService.uninstallPackage(
          message.packageName,
          this._currentProjectPath,
          this._currentPackageManager
        );
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
      message: 'Cache refreshed successfully',
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
      isIgnored,
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
      path: p.path,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a project to manage dependencies',
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
          message: 'No package.json found in the selected project',
        });
        return;
      }

      const packageJson = await readPackageJson(packageJsonPath);
      const columnConfig = this._getColumnConfig();
      let dependencies = await extractDependencies(packageJson, this._currentProjectPath, {
        includeSize: columnConfig.size,
        concurrency: 10,
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
          vulnerabilityCount: getPackageVulnerabilityCount(auditResult, dep.name),
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
      const displayName = currentProject ? currentProject.name : packageJson.name || 'Unnamed Package';

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
        lastUpdate: this._updateHistory,
      });

      // Update panel title with project name
      const projectName = currentProject?.name || packageJson.name || 'NPM Package Manager';
      this._panel.title = `NPM: ${projectName}`;

      // Start checking updates in parallel
      await this._checkUpdates(dependencies);
    } catch (error) {
      this._sendMessage({
        type: 'ERROR',
        message: `Failed to load dependencies: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async _loadIgnoredStatus(dependencies: Dependency[]): Promise<Dependency[]> {
    const ignoreService = getIgnoreService();
    return dependencies.map(dep => ({
      ...dep,
      isIgnored: ignoreService.isIgnored(dep.name),
      ignoreReason: ignoreService.getIgnoreReason(dep.name),
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
      semverUpdate: config.get('semverUpdate', true),
    };
  }

  /**
   * Check available updates for dependencies
   */
  private async _checkUpdates(dependencies: Dependency[], forceRefresh: boolean = false): Promise<void> {
    const batchSize = 5; // Process in batches to avoid overloading
    const dependenciesToCheck = Array.from(
      new Map(dependencies.filter(dep => !dep.isIgnored).map(dep => [dep.name, dep] as const)).values()
    );

    for (let i = 0; i < dependenciesToCheck.length; i += batchSize) {
      const batch = dependenciesToCheck.slice(i, i + batchSize);
      const promises = batch.map(async dep => {
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
            repositoryUrl: details.repositoryUrl,
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
   * Search packages in npm registry
   */
  private async _searchPackages(query: string): Promise<void> {
    // Abort previous search if it's still running
    if (this._searchAbortController) {
      this._searchAbortController.abort();
    }

    if (!query.trim()) {
      this._sendMessage({
        type: 'SEARCH_RESULTS',
        results: [],
      });
      return;
    }

    // Create new abort controller for this search
    this._searchAbortController = new AbortController();
    const signal = this._searchAbortController.signal;

    try {
      this._sendMessage({
        type: 'PROGRESS',
        message: `Searching for "${query}"...`,
      });

      const results = await searchPackages(query, 20, signal);

      // If signal was aborted, results will be empty or searchPackages handled it.
      // But we double check here to avoid updating UI with stale data if necessary.
      if (signal.aborted) {
        return;
      }

      this._sendMessage({
        type: 'SEARCH_RESULTS',
        results,
      });

      this._sendMessage({
        type: 'PROGRESS',
        message: null as any,
      });
    } catch (error: any) {
      if (signal.aborted) {
        return;
      }

      console.error('Search failed:', error);
      this._sendMessage({
        type: 'SEARCH_RESULTS',
        results: [],
      });
      vscode.window.showErrorMessage(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (this._searchAbortController?.signal === signal) {
        this._searchAbortController = null;
      }
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
    const language = getVSCodeLanguage();
    this._panel.webview.html = getHtmlForWebview(this._panel.webview, this._extensionUri, language);
  }

  public dispose(): void {
    NpmGuiManagerPanel.currentPanel = undefined;

    if (this._fileWatcherDebounce) {
      clearTimeout(this._fileWatcherDebounce);
    }

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
