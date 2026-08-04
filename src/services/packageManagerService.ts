/**
 * Service for detecting and working with different package managers
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PackageManager } from '../../types';

export interface PackageManagerInfo {
  name: PackageManager;
  displayName: string;
  installCommand: string;
  addCommand: string;
  auditCommand: string;
  /**
   * Lock files that identify this package manager, most current format first.
   * More than one when a manager changed its lock file across versions.
   */
  lockFiles: string[];
  runCommand: string;
  devFlag: string;
  exactFlag: string;
}

const PACKAGE_MANAGERS: Record<PackageManager, PackageManagerInfo> = {
  npm: {
    name: 'npm',
    displayName: 'NPM',
    installCommand: 'npm install',
    addCommand: 'npm install',
    auditCommand: 'npm audit --json',
    lockFiles: ['package-lock.json'],
    runCommand: 'npm run',
    devFlag: '--save-dev',
    exactFlag: '--save-exact',
  },
  yarn: {
    name: 'yarn',
    displayName: 'Yarn',
    installCommand: 'yarn install',
    addCommand: 'yarn add',
    auditCommand: 'yarn audit --json',
    lockFiles: ['yarn.lock'],
    runCommand: 'yarn',
    devFlag: '--dev',
    exactFlag: '--exact',
  },
  pnpm: {
    name: 'pnpm',
    displayName: 'PNPM',
    installCommand: 'pnpm install',
    addCommand: 'pnpm add',
    auditCommand: 'pnpm audit --json',
    lockFiles: ['pnpm-lock.yaml'],
    runCommand: 'pnpm run',
    devFlag: '--save-dev',
    exactFlag: '--save-exact',
  },
  bun: {
    name: 'bun',
    displayName: 'Bun',
    installCommand: 'bun install',
    addCommand: 'bun add',
    // Without --json bun prints a human-readable summary that no parser can
    // read, so the audit silently reported nothing.
    auditCommand: 'bun audit --json',
    // Bun 1.2 replaced the binary bun.lockb with the text bun.lock. Both are
    // still in the wild, so either one identifies a bun project.
    lockFiles: ['bun.lock', 'bun.lockb'],
    runCommand: 'bun run',
    devFlag: '--dev',
    exactFlag: '--exact',
  },
};

/**
 * Detect which package manager is used in a project
 */
export async function detectPackageManager(projectPath: string): Promise<PackageManager> {
  // Check for lock files
  for (const [name, info] of Object.entries(PACKAGE_MANAGERS)) {
    for (const lockFile of info.lockFiles) {
      const lockFilePath = path.join(projectPath, lockFile);
      try {
        await fs.promises.access(lockFilePath, fs.constants.F_OK);
        return name as PackageManager;
      } catch {
        // Lock file doesn't exist, continue
      }
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
export function getInstallCommand(
  manager: PackageManager,
  packageName: string,
  version?: string,
  saveExact: boolean = false
): string {
  const info = PACKAGE_MANAGERS[manager];
  const versionSuffix = version ? `@${version}` : '';
  const exactFlag = saveExact ? ` ${info.exactFlag}` : '';
  return `${info.addCommand}${exactFlag} ${packageName}${versionSuffix}`;
}

/**
 * Get the install all command for a project
 */
export function getInstallAllCommand(manager: PackageManager): string {
  return PACKAGE_MANAGERS[manager].installCommand;
}

/**
 * Get the audit command declared for a package manager.
 *
 * Prefer `getAuditCommandForProject` when a project path is available: yarn
 * needs a different command depending on its major version.
 */
export function getAuditCommand(manager: PackageManager): string {
  return PACKAGE_MANAGERS[manager].auditCommand;
}

/**
 * Whether the project uses yarn 2+ ("berry") rather than yarn classic.
 *
 * Berry writes a `__metadata` block at the top of yarn.lock, which classic lock
 * files never contain. Only the head of the file is read, since the block is in
 * the first few lines and lock files get large. `.yarnrc.yml` is a secondary
 * signal, as it exists only for berry.
 */
export async function isYarnBerry(projectPath: string): Promise<boolean> {
  try {
    const handle = await fs.promises.open(path.join(projectPath, 'yarn.lock'), 'r');
    try {
      const buffer = Buffer.alloc(1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (/^__metadata:/m.test(buffer.subarray(0, bytesRead).toString('utf-8'))) {
        return true;
      }
    } finally {
      await handle.close();
    }
  } catch {
    // No readable yarn.lock; fall through to the .yarnrc.yml check
  }

  try {
    await fs.promises.access(path.join(projectPath, '.yarnrc.yml'), fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the audit command to run in a specific project.
 *
 * Yarn 2+ removed `yarn audit`; the equivalent is `yarn npm audit`, which
 * reports in the same advisories shape npm 6 used.
 */
export async function getAuditCommandForProject(manager: PackageManager, projectPath: string): Promise<string> {
  if (manager === 'yarn' && (await isYarnBerry(projectPath))) {
    return 'yarn npm audit --json';
  }

  return getAuditCommand(manager);
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

export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

export interface SeverityCounts {
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
}

export interface ParsedVulnerability {
  id: string;
  title: string;
  severity: Severity;
  packageName: string;
  vulnerableVersions: string;
  patchedVersions: string;
  url?: string;
}

export interface ParsedAudit {
  vulnerabilities: ParsedVulnerability[];
  metadata: { vulnerabilities: SeverityCounts };
}

const SEVERITIES: Severity[] = ['info', 'low', 'moderate', 'high', 'critical'];

function emptyCounts(): SeverityCounts {
  return { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;
}

/** Unknown or missing severities are reported as 'info' rather than dropped. */
function toSeverity(value: unknown): Severity {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : 'info';
}

function toCounts(value: unknown): SeverityCounts | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const counts = emptyCounts();
  let sawNumber = false;
  for (const severity of SEVERITIES) {
    const count = value[severity];
    if (typeof count === 'number') {
      counts[severity] = count;
      sawNumber = true;
    }
  }

  return sawNumber ? counts : undefined;
}

/**
 * Split raw audit output into JSON documents.
 *
 * npm, pnpm and yarn berry print a single JSON object. Yarn classic prints
 * newline-delimited JSON — one object per line — which a single `JSON.parse`
 * of the whole output cannot read. Sniffing the shape rather than trusting the
 * package manager also keeps this working when a manager changes format.
 */
function parseJsonDocuments(output: string): Record<string, unknown>[] {
  try {
    const single = JSON.parse(output) as unknown;
    if (isRecord(single)) {
      return [single];
    }
  } catch {
    // Not a single object; try newline-delimited JSON below
  }

  const documents: Record<string, unknown>[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        documents.push(parsed);
      }
    } catch {
      // Progress lines and warnings are not JSON; skip them
    }
  }

  return documents;
}

/**
 * Whether an object looks like an advisory rather than some other array entry.
 *
 * Needed because npm 6 output carries unrelated top-level arrays (`actions`,
 * `muted`) that would otherwise be mistaken for advisories keyed by package
 * name. Every known advisory shape reports a severity; the npm 6 fix actions do
 * not.
 */
function looksLikeAdvisory(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.severity === 'string';
}

/**
 * Read an advisory in the shape npm 6, pnpm, yarn (both majors) and the npm
 * bulk advisory endpoint use. `id` falls back to the caller's key, since yarn
 * nests the id inside; `packageName` falls back to the caller's key too, since
 * the bulk endpoint puts the package name in the map key.
 */
function fromAdvisory(
  advisory: Record<string, unknown>,
  fallbackId: string,
  fallbackPackageName?: string
): ParsedVulnerability | null {
  const packageName = asString(advisory.module_name) ?? asString(advisory.name) ?? fallbackPackageName;
  if (!packageName) {
    return null;
  }

  return {
    id: asString(advisory.id) ?? fallbackId,
    title: asString(advisory.title) ?? `Vulnerability in ${packageName}`,
    severity: toSeverity(advisory.severity),
    packageName,
    vulnerableVersions: asString(advisory.vulnerable_versions) ?? '*',
    patchedVersions: asString(advisory.patched_versions) ?? 'Not available',
    url: asString(advisory.url),
  };
}

/** Read an entry of the npm 7+ `vulnerabilities` map, keyed by package name. */
function fromNpmVulnerability(packageName: string, vulnerability: Record<string, unknown>): ParsedVulnerability {
  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  const source = isRecord(via[0]) ? via[0] : undefined;

  return {
    id: `${packageName}-${asString(vulnerability.severity) ?? 'unknown'}`,
    title: asString(source?.title) ?? `Vulnerability in ${packageName}`,
    severity: toSeverity(vulnerability.severity),
    packageName,
    vulnerableVersions: asString(source?.range) ?? '*',
    patchedVersions: vulnerability.fixAvailable ? 'Available' : 'Not available',
    url: asString(source?.url),
  };
}

/**
 * Parse audit output from any supported package manager.
 *
 * The manager is accepted for API symmetry but deliberately unused: the format
 * is detected from the payload, so a manager that changes shape between
 * versions (or a project audited by a different manager than detected) still
 * parses. Recognised shapes:
 *   - `{ vulnerabilities: { <pkg>: … } }`      npm 7+
 *   - `{ advisories: { <id>: … } }`            npm 6, pnpm, yarn berry
 *   - `{ data: { advisories: [ … ] } }`        legacy wrapper
 *   - `{"type":"auditAdvisory","data":{…}}`    yarn classic, one JSON per line
 *   - `{ <pkg>: [ … ] }`                       npm bulk advisory endpoint, bun
 */
export function parseAuditOutput(_manager: PackageManager, output: string): ParsedAudit {
  const documents = parseJsonDocuments(output);

  const vulnerabilities: ParsedVulnerability[] = [];
  let counts: SeverityCounts | undefined;

  const addAdvisory = (advisory: unknown, fallbackId: string, fallbackPackageName?: string): void => {
    if (!isRecord(advisory)) {
      return;
    }
    const parsed = fromAdvisory(advisory, fallbackId, fallbackPackageName);
    if (parsed) {
      vulnerabilities.push(parsed);
    }
  };

  for (const document of documents) {
    // Yarn classic emits one `auditAdvisory` per dependency path, so the same
    // advisory arrives repeatedly; duplicates are removed below.
    if (document.type === 'auditAdvisory' && isRecord(document.data)) {
      addAdvisory(document.data.advisory, 'unknown');
    }

    if (document.type === 'auditSummary' && isRecord(document.data)) {
      counts = toCounts(document.data.vulnerabilities) ?? counts;
      continue;
    }

    if (isRecord(document.advisories)) {
      for (const [id, advisory] of Object.entries(document.advisories)) {
        addAdvisory(advisory, id);
      }
    }

    if (isRecord(document.data) && Array.isArray(document.data.advisories)) {
      for (const advisory of document.data.advisories) {
        addAdvisory(advisory, 'unknown');
      }
    }

    if (isRecord(document.vulnerabilities)) {
      for (const [packageName, vulnerability] of Object.entries(document.vulnerabilities)) {
        if (isRecord(vulnerability)) {
          vulnerabilities.push(fromNpmVulnerability(packageName, vulnerability));
        }
      }
    }

    // Bun reports the raw npm bulk advisory response: a map of package name to
    // an array of advisories, with no wrapper key. Entries are checked for an
    // advisory shape so unrelated top-level arrays (npm 6 ships `actions` and
    // `muted`) cannot be mistaken for vulnerabilities of a package named after
    // the key.
    for (const [packageName, entries] of Object.entries(document)) {
      if (!Array.isArray(entries)) {
        continue;
      }
      for (const entry of entries) {
        if (looksLikeAdvisory(entry)) {
          addAdvisory(entry, 'unknown', packageName);
        }
      }
    }

    if (isRecord(document.metadata)) {
      counts = toCounts(document.metadata.vulnerabilities) ?? counts;
    }
  }

  return {
    vulnerabilities: dedupeVulnerabilities(vulnerabilities),
    metadata: { vulnerabilities: counts ?? emptyCounts() },
  };
}

/**
 * Collapse repeats of the same advisory. Yarn classic reports one entry per
 * dependency path, which would otherwise inflate the per-package counts shown
 * in the table.
 */
function dedupeVulnerabilities(vulnerabilities: ParsedVulnerability[]): ParsedVulnerability[] {
  const seen = new Set<string>();
  const result: ParsedVulnerability[] = [];

  for (const vulnerability of vulnerabilities) {
    const key =
      vulnerability.id !== 'unknown'
        ? `${vulnerability.packageName}|${vulnerability.id}`
        : `${vulnerability.packageName}|${vulnerability.title}|${vulnerability.vulnerableVersions}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(vulnerability);
    }
  }

  return result;
}
