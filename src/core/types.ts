/**
 * Tipos compartidos entre Extension Host y Webview
 */

export type SemverUpdateType = 'major' | 'minor' | 'patch' | 'none' | 'unknown';

export interface Dependency {
  name: string;
  installedVersion: string;
  declaredVersion: string;  // Versión del package.json (ej: "^5", "~1.2.0")
  latestVersion?: string;
  type: 'dependencies' | 'devDependencies' | 'peerDependencies';
  updateAvailable?: boolean;
  semverUpdateType?: SemverUpdateType;
  size?: string;
  lastPublishDate?: string;
  hasVulnerabilities?: boolean;
  vulnerabilityCount?: number;
  isDeprecated?: boolean;
  deprecationMessage?: string;
  isIgnored?: boolean;
  ignoreReason?: string;
}

export interface ColumnConfig {
  size: boolean;
  type: boolean;
  lastUpdate: boolean;
  security: boolean;
  semverUpdate: boolean;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

// Mensajes desde Webview al Extension Host
export type WebviewToHostMessage =
  | { type: 'GET_DEPENDENCIES' }
  | { type: 'SELECT_PROJECT'; path: string }
  | { type: 'UPDATE_PACKAGE'; packageName: string; version: string; currentVersion?: string }
  | { type: 'UPDATE_ALL_PACKAGES'; packages: { name: string; version: string; currentVersion?: string }[] }
  | { type: 'ROLLBACK_LAST' }
  | { type: 'CHECK_UPDATES'; dependencies: Dependency[]; forceRefresh?: boolean }
  | { type: 'REFRESH_CACHE' }
  | { type: 'TOGGLE_IGNORE_PACKAGE'; packageName: string; currentVersion?: string }
  | { type: 'GET_SCRIPTS' }
  | { type: 'RUN_SCRIPT'; scriptName: string }

// Mensajes desde Extension Host al Webview
export interface ProjectInfo {
  name: string;
  path: string;
  relativePath: string;
}

export interface VersionInfo {
  nodeVersion: string;
  packageManagerVersion: string;
}

export interface NpmScript {
  name: string;
  command: string;
}

export interface UpdateHistory {
  timestamp: number;
  packages: Array<{
    name: string;
    previousDeclaredVersion: string;  // ej: "^5" - versión del package.json
    previousInstalledVersion: string; // ej: "5.9.3" - versión real en node_modules
    newVersion: string;
  }>;
}

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export type HostToWebviewMessage =
  | { type: 'DEPENDENCIES_DATA'; dependencies: Dependency[]; packageName: string; columnConfig: ColumnConfig; projects?: ProjectInfo[]; currentProjectPath?: string; packageManager?: PackageManager; versions?: VersionInfo; lastUpdate?: UpdateHistory | null; scripts?: NpmScript[] }
  | { type: 'UPDATE_RESULT'; success: boolean; packageName: string; message: string }
  | { type: 'ROLLBACK_RESULT'; success: boolean; message: string; rolledBackPackages?: string[] }
  | { type: 'VERSION_CHECK_RESULT'; dependency: Dependency; latestVersion: string; semverUpdateType?: SemverUpdateType; lastPublishDate?: string; fromCache?: boolean; cacheAge?: number; isDeprecated?: boolean; deprecationMessage?: string }
  | { type: 'CACHE_CLEARED'; message: string }
  | { type: 'IGNORE_TOGGLED'; packageName: string; isIgnored: boolean }
  | { type: 'SCRIPTS_DATA'; scripts: NpmScript[]; projectPath: string }
  | { type: 'COLUMN_CONFIG'; config: ColumnConfig }
  | { type: 'ERROR'; message: string }
  | { type: 'PROGRESS'; message: string };
