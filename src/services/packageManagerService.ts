/**
 * Service for detecting and working with different package managers
 */

import * as fs from 'fs';
import * as path from 'path';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface PackageManagerInfo {
  name: PackageManager;
  displayName: string;
  installCommand: string;
  addCommand: string;
  auditCommand: string;
  lockFile: string;
  runCommand: string;
  devFlag: string;
}

const PACKAGE_MANAGERS: Record<PackageManager, PackageManagerInfo> = {
  npm: {
    name: 'npm',
    displayName: 'NPM',
    installCommand: 'npm install',
    addCommand: 'npm install',
    auditCommand: 'npm audit --json',
    lockFile: 'package-lock.json',
    runCommand: 'npm run',
    devFlag: '--save-dev',
  },
  yarn: {
    name: 'yarn',
    displayName: 'Yarn',
    installCommand: 'yarn install',
    addCommand: 'yarn add',
    auditCommand: 'yarn audit --json',
    lockFile: 'yarn.lock',
    runCommand: 'yarn',
    devFlag: '--dev',
  },
  pnpm: {
    name: 'pnpm',
    displayName: 'PNPM',
    installCommand: 'pnpm install',
    addCommand: 'pnpm add',
    auditCommand: 'pnpm audit --json',
    lockFile: 'pnpm-lock.yaml',
    runCommand: 'pnpm run',
    devFlag: '--save-dev',
  },
  bun: {
    name: 'bun',
    displayName: 'Bun',
    installCommand: 'bun install',
    addCommand: 'bun add',
    auditCommand: 'bun audit', // Bun may not support --json flag yet
    lockFile: 'bun.lockb',
    runCommand: 'bun run',
    devFlag: '--dev',
  },
};

/**
 * Detect which package manager is used in a project
 */
export async function detectPackageManager(projectPath: string): Promise<PackageManager> {
  // Check for lock files
  for (const [name, info] of Object.entries(PACKAGE_MANAGERS)) {
    const lockFilePath = path.join(projectPath, info.lockFile);
    try {
      await fs.promises.access(lockFilePath, fs.constants.F_OK);
      return name as PackageManager;
    } catch {
      // Lock file doesn't exist, continue
    }
  }

  // Default to npm if no lock file found
  return 'npm';
}

/**
 * Get package manager info
 */
export function getPackageManagerInfo(manager: PackageManager): PackageManagerInfo {
  return PACKAGE_MANAGERS[manager];
}

/**
 * Get the install command for a package
 */
export function getInstallCommand(manager: PackageManager, packageName: string, version?: string): string {
  const info = PACKAGE_MANAGERS[manager];
  const versionSuffix = version ? `@${version}` : '';
  return `${info.addCommand} ${packageName}${versionSuffix}`;
}

/**
 * Get the install all command for a project
 */
export function getInstallAllCommand(manager: PackageManager): string {
  return PACKAGE_MANAGERS[manager].installCommand;
}

/**
 * Get the audit command
 */
export function getAuditCommand(manager: PackageManager): string {
  return PACKAGE_MANAGERS[manager].auditCommand;
}

/**
 * Get the uninstall command for a package
 */
export function getUninstallCommand(manager: PackageManager, packageName: string): string {
  const commands: Record<PackageManager, string> = {
    npm: `npm uninstall ${packageName}`,
    yarn: `yarn remove ${packageName}`,
    pnpm: `pnpm remove ${packageName}`,
    bun: `bun remove ${packageName}`,
  };
  return commands[manager];
}

/**
 * Parse audit output for different package managers
 */
export function parseAuditOutput(
  _manager: PackageManager,
  output: string
): {
  vulnerabilities: Array<{
    id: string;
    title: string;
    severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
    packageName: string;
    vulnerableVersions: string;
    patchedVersions: string;
  }>;
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
    };
  };
} {
  try {
    const data = JSON.parse(output);

    // NPM format
    if (data.vulnerabilities || data.advisories) {
      return parseNpmAudit(data);
    }

    // Yarn format (different structure)
    if (data.data && data.data.advisories) {
      return parseYarnAudit(data);
    }

    // PNPM format
    if (data.advisories) {
      return parseNpmAudit(data); // Similar to npm
    }

    // Default fallback
    return {
      vulnerabilities: [],
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
    };
  } catch {
    // If JSON parsing fails, return empty result
    return {
      vulnerabilities: [],
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
    };
  }
}

function parseNpmAudit(data: any) {
  const vulnerabilities: any[] = [];

  if (data.advisories) {
    for (const [id, advisory] of Object.entries(data.advisories)) {
      const adv = advisory as any;
      vulnerabilities.push({
        id,
        title: adv.title,
        severity: adv.severity,
        packageName: adv.module_name,
        vulnerableVersions: adv.vulnerable_versions,
        patchedVersions: adv.patched_versions,
      });
    }
  }

  if (data.vulnerabilities) {
    for (const [packageName, vuln] of Object.entries(data.vulnerabilities)) {
      const v = vuln as any;
      const title =
        Array.isArray(v.via) && v.via.length > 0 && typeof v.via[0] === 'object'
          ? v.via[0].title
          : `Vulnerability in ${packageName}`;
      const vulnerableVersions =
        Array.isArray(v.via) && v.via.length > 0 && typeof v.via[0] === 'object' ? v.via[0].range : '*';

      vulnerabilities.push({
        id: `${packageName}-${v.severity}`,
        title,
        severity: v.severity,
        packageName,
        vulnerableVersions,
        patchedVersions: v.fixAvailable ? 'Available' : 'Not available',
      });
    }
  }

  const metadata = data.metadata || { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } };

  return {
    vulnerabilities,
    metadata: {
      vulnerabilities: metadata.vulnerabilities || { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    },
  };
}

function parseYarnAudit(data: any) {
  const vulnerabilities: any[] = [];

  if (data.data && data.data.advisories) {
    for (const advisory of data.data.advisories) {
      vulnerabilities.push({
        id: advisory.id,
        title: advisory.title,
        severity: advisory.severity,
        packageName: advisory.module_name,
        vulnerableVersions: advisory.vulnerable_versions,
        patchedVersions: advisory.patched_versions,
      });
    }
  }

  const metadata = data.metadata || { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } };

  return {
    vulnerabilities,
    metadata: {
      vulnerabilities: metadata.vulnerabilities || { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    },
  };
}
