/**
 * Tipos compartidos entre Extension Host y Webview
 * (Duplicado de src/types.ts para uso en el webview)
 */

export type SemverUpdateType = 'major' | 'minor' | 'patch' | 'none' | 'unknown';

export interface Dependency {
  name: string;
  installedVersion: string;
  latestVersion?: string;
  type: 'dependencies' | 'devDependencies' | 'peerDependencies';
  updateAvailable?: boolean;
  semverUpdateType?: SemverUpdateType;
  size?: string;
  lastPublishDate?: string;
  hasVulnerabilities?: boolean;
  vulnerabilityCount?: number;
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
}

export interface ProjectInfo {
  name: string;
  path: string;
  relativePath: string;
}

// Mensajes desde Webview al Extension Host
export type WebviewToHostMessage =
  | { type: 'GET_DEPENDENCIES' }
  | { type: 'SELECT_PROJECT'; path: string }
  | { type: 'UPDATE_PACKAGE'; packageName: string; version: string; currentVersion?: string }
  | { type: 'UPDATE_ALL_PACKAGES'; packages: { name: string; version: string; currentVersion?: string }[] }
  | { type: 'CHECK_UPDATES'; dependencies: Dependency[] };

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

// Mensajes desde Extension Host al Webview
export type HostToWebviewMessage =
  | { type: 'DEPENDENCIES_DATA'; dependencies: Dependency[]; packageName: string; columnConfig: ColumnConfig; projects?: ProjectInfo[]; currentProjectPath?: string; packageManager?: PackageManager }
  | { type: 'UPDATE_RESULT'; success: boolean; packageName: string; message: string }
  | { type: 'VERSION_CHECK_RESULT'; dependency: Dependency; latestVersion: string; semverUpdateType?: SemverUpdateType; lastPublishDate?: string }
  | { type: 'COLUMN_CONFIG'; config: ColumnConfig }
  | { type: 'ERROR'; message: string }
  | { type: 'PROGRESS'; message: string };
