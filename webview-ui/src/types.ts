/**
 * Tipos compartidos entre Extension Host y Webview
 * (Duplicado de src/types.ts para uso en el webview)
 */

export interface Dependency {
  name: string;
  installedVersion: string;
  latestVersion?: string;
  type: 'dependencies' | 'devDependencies' | 'peerDependencies';
  updateAvailable?: boolean;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

// Mensajes desde Webview al Extension Host
export type WebviewToHostMessage =
  | { type: 'GET_DEPENDENCIES' }
  | { type: 'UPDATE_PACKAGE'; packageName: string; version: string }
  | { type: 'UPDATE_ALL_PACKAGES'; packages: { name: string; version: string }[] }
  | { type: 'CHECK_UPDATES'; dependencies: Dependency[] };

// Mensajes desde Extension Host al Webview
export type HostToWebviewMessage =
  | { type: 'DEPENDENCIES_DATA'; dependencies: Dependency[]; packageName: string }
  | { type: 'UPDATE_RESULT'; success: boolean; packageName: string; message: string }
  | { type: 'VERSION_CHECK_RESULT'; dependency: Dependency; latestVersion: string }
  | { type: 'ERROR'; message: string }
  | { type: 'PROGRESS'; message: string };
