/**
 * Service for running security audits using the detected package manager
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { detectPackageManager, getAuditCommandForProject, parseAuditOutput } from './packageManagerService';
import { resolveCommandPath } from '../utils/resolveExecutable';

const execAsync = promisify(exec);
const DEFAULT_AUDIT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface Vulnerability {
  id: string;
  title: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  packageName: string;
  vulnerableVersions: string;
  patchedVersions: string;
  overview: string;
  url?: string;
}

export interface AuditResult {
  vulnerabilities: Vulnerability[];
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
    };
    totalDependencies: number;
  };
}

export interface RunAuditOptions {
  forceRefresh?: boolean;
  ttlMs?: number;
}

interface AuditCacheEntry {
  result: AuditResult;
  timestamp: number;
}

const auditCache = new Map<string, AuditCacheEntry>();

/**
 * Run security audit using the detected package manager
 */
export async function runAudit(projectPath: string, options: RunAuditOptions = {}): Promise<AuditResult> {
  const ttlMs = options.ttlMs ?? DEFAULT_AUDIT_CACHE_TTL_MS;
  const cached = auditCache.get(projectPath);

  if (!options.forceRefresh && cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.result;
  }

  const packageManager = await detectPackageManager(projectPath);
  const auditCommand = await resolveCommandPath(await getAuditCommandForProject(packageManager, projectPath));

  let stdout: string;
  let commandFailed = false;
  try {
    ({ stdout } = await execAsync(auditCommand, {
      cwd: projectPath,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    }));
  } catch (error) {
    // A failed refresh must not leave a cached clean result available.
    auditCache.delete(projectPath);
    const failure = error as { code?: unknown; stdout?: unknown; killed?: boolean; signal?: unknown } | null;
    if (
      !failure ||
      failure.killed ||
      failure.signal ||
      typeof failure.code !== 'number' ||
      typeof failure.stdout !== 'string' ||
      !failure.stdout.trim()
    ) {
      throw error;
    }
    stdout = failure.stdout;
    commandFailed = true;
  }

  const parsed = parseAuditOutput(packageManager, stdout);
  // Nonzero exits are normal for findings, but never proof of a clean audit.
  const hasFindings =
    parsed.vulnerabilities.length > 0 || Object.values(parsed.metadata.vulnerabilities).some(count => count > 0);
  if (!parsed.valid || (commandFailed && !hasFindings)) {
    auditCache.delete(projectPath);
    throw new Error('Security audit did not return a valid report');
  }

  const result: AuditResult = {
    vulnerabilities: parsed.vulnerabilities.map(v => ({ ...v, overview: v.title })),
    metadata: {
      vulnerabilities: parsed.metadata.vulnerabilities,
      totalDependencies: 0, // Not available in all formats
    },
  };
  auditCache.set(projectPath, { result, timestamp: Date.now() });
  return result;
}

export function clearAuditCache(projectPath?: string): void {
  if (projectPath) {
    auditCache.delete(projectPath);
    return;
  }

  auditCache.clear();
}

/**
 * Check if a package has vulnerabilities
 */
export function hasVulnerabilities(auditResult: AuditResult, packageName: string): boolean {
  return auditResult.vulnerabilities.some(v => v.packageName === packageName);
}

/**
 * Get vulnerability count for a specific package
 */
export function getPackageVulnerabilityCount(auditResult: AuditResult, packageName: string): number {
  return auditResult.vulnerabilities.filter(v => v.packageName === packageName).length;
}

/**
 * Get vulnerability details for a specific package
 */
export function getPackageVulnerabilities(auditResult: AuditResult, packageName: string): Vulnerability[] {
  return auditResult.vulnerabilities.filter(v => v.packageName === packageName);
}

// Re-export for convenience
export { detectPackageManager };
