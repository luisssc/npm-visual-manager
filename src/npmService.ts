/**
 * Servicio para interactuar con el registro de NPM
 */

import * as https from 'https';

export interface NpmPackageInfo {
  name: string;
  'dist-tags': {
    latest: string;
    [tag: string]: string;
  };
  versions: Record<string, unknown>;
}

/**
 * Obtiene la información de un paquete desde el registro de NPM
 */
export function getPackageInfo(packageName: string): Promise<NpmPackageInfo> {
  return new Promise((resolve, reject) => {
    const encodedName = encodeURIComponent(packageName).replace('%40', '@');
    const url = `https://registry.npmjs.org/${encodedName}`;

    const req = https.get(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'npm-gui-manager-vscode-extension'
      },
      timeout: 10000
    }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const packageInfo: NpmPackageInfo = JSON.parse(data);
            resolve(packageInfo);
          } else if (res.statusCode === 404) {
            reject(new Error(`Package "${packageName}" not found in npm registry`));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse npm response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout for package "${packageName}"`));
    });
  });
}

/**
 * Obtiene la última versión de un paquete
 */
export async function getLatestVersion(packageName: string): Promise<string> {
  const info = await getPackageInfo(packageName);
  return info['dist-tags'].latest;
}

/**
 * Limpia la versión eliminando prefijos como ^, ~, >=, etc.
 */
export function cleanVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, '');
}

/**
 * Compara dos versiones semver (simplificada)
 * Retorna: -1 si v1 < v2, 0 si v1 === v2, 1 si v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = cleanVersion(v1);
  const clean2 = cleanVersion(v2);

  const parts1 = clean1.split('.').map(Number);
  const parts2 = clean2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 < p2) {return -1;}
    if (p1 > p2) {return 1;}
  }

  return 0;
}

/**
 * Verifica si hay una actualización disponible
 */
export function isUpdateAvailable(installed: string, latest: string): boolean {
  return compareVersions(cleanVersion(installed), latest) < 0;
}
