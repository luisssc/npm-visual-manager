/**
 * Shared types between Extension Host and Webview
 */

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export type SemverUpdateType = 'major' | 'minor' | 'patch' | 'none' | 'unknown';

export interface SearchResult {
  name: string;
  version: string;
  description: string;
  keywords?: string[];
  date: string;
  author?: { name?: string; email?: string };
  publisher?: { username?: string; email?: string };
  downloads?: { weekly?: number };
  score?: { final: number; quality: number; popularity: number; maintenance: number };
}

export interface Dependency {
  name: string;
  installedVersion: string;
  declaredVersion: string;
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
  repositoryUrl?: string;
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

export interface ProjectInfo {
  name: string;
  path: string;
  relativePath: string;
}

export interface VersionInfo {
  nodeVersion: string;
  packageManagerVersion: string;
}

export interface UpdateHistory {
  timestamp: number;
  packages: Array<{
    name: string;
    previousDeclaredVersion: string;
    previousInstalledVersion: string;
    newVersion: string;
  }>;
}

// Messages from Webview to Extension Host
export type WebviewToHostMessage =
  | { type: 'GET_DEPENDENCIES' }
  | { type: 'SELECT_PROJECT'; path: string }
  | { type: 'UPDATE_PACKAGE'; packageName: string; version: string; currentVersion?: string }
  | { type: 'UPDATE_ALL_PACKAGES'; packages: { name: string; version: string; currentVersion?: string }[] }
  | { type: 'ROLLBACK_LAST' }
  | { type: 'CHECK_UPDATES'; dependencies: Dependency[]; forceRefresh?: boolean }
  | { type: 'REFRESH_CACHE' }
  | { type: 'TOGGLE_IGNORE_PACKAGE'; packageName: string; currentVersion?: string }
  | { type: 'SEARCH_PACKAGES'; query: string }
  | { type: 'INSTALL_NEW_PACKAGE'; packageName: string; version: string; isDev: boolean }
  | { type: 'GET_AUDIT' }
  | { type: 'OPEN_EXTERNAL'; url: string }
  | { type: 'UNINSTALL_PACKAGE'; packageName: string };

// Messages from Extension Host to Webview
export type HostToWebviewMessage =
  | {
      type: 'DEPENDENCIES_DATA';
      dependencies: Dependency[];
      packageName: string;
      columnConfig: ColumnConfig;
      projects?: ProjectInfo[];
      currentProjectPath?: string;
      packageManager?: PackageManager;
      versions?: VersionInfo;
      lastUpdate?: UpdateHistory | null;
    }
  | { type: 'UPDATE_RESULT'; success: boolean; packageName: string; message: string }
  | { type: 'ROLLBACK_RESULT'; success: boolean; message: string; rolledBackPackages?: string[] }
  | {
      type: 'VERSION_CHECK_RESULT';
      dependency: Dependency;
      latestVersion: string;
      semverUpdateType?: SemverUpdateType;
      lastPublishDate?: string;
      fromCache?: boolean;
      cacheAge?: number;
      isDeprecated?: boolean;
      deprecationMessage?: string;
      repositoryUrl?: string;
    }
  | { type: 'CACHE_CLEARED'; message: string }
  | { type: 'IGNORE_TOGGLED'; packageName: string; isIgnored: boolean }
  | { type: 'UNINSTALL_RESULT'; packageName: string; success: boolean; message: string }
  | { type: 'SEARCH_RESULTS'; results: SearchResult[] }
  | { type: 'COLUMN_CONFIG'; config: ColumnConfig }
  | { type: 'INSTALL_RESULT'; packageName: string; success: boolean; message: string }
  | { type: 'ERROR'; message: string }
  | { type: 'PROGRESS'; message: string };
