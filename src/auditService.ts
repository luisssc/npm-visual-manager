/**
 * Service for running security audits using the detected package manager
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { detectPackageManager, getAuditCommand, parseAuditOutput, PackageManager } from './packageManagerService';

const execAsync = promisify(exec);

export interface Vulnerability {
  id: string;
  title: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  packageName: string;
  vulnerableVersions: string;
  patchedVersions: string;
  overview: string;
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

/**
 * Run security audit using the detected package manager
 */
export async function runAudit(projectPath: string): Promise<AuditResult> {
  const packageManager = await detectPackageManager(projectPath);
  const auditCommand = getAuditCommand(packageManager);
  
  try {
    const { stdout } = await execAsync(auditCommand, {
      cwd: projectPath,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const parsed = parseAuditOutput(packageManager, stdout);
    
    return {
      vulnerabilities: parsed.vulnerabilities.map(v => ({
        ...v,
        overview: v.title
      })),
      metadata: {
        vulnerabilities: parsed.metadata.vulnerabilities,
        totalDependencies: 0 // Not available in all formats
      }
    };
  } catch (error) {
    // Package managers return exit code 1 when vulnerabilities are found
    // but still output valid data
    if (error instanceof Error && 'stdout' in error) {
      const stdout = (error as { stdout: string }).stdout;
      if (stdout) {
        const parsed = parseAuditOutput(packageManager, stdout);
        return {
          vulnerabilities: parsed.vulnerabilities.map(v => ({
            ...v,
            overview: v.title
          })),
          metadata: {
            vulnerabilities: parsed.metadata.vulnerabilities,
            totalDependencies: 0
          }
        };
      }
    }
    // Return empty result if audit fails
    return {
      vulnerabilities: [],
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
        totalDependencies: 0
      }
    };
  }
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

// Re-export for convenience
export { detectPackageManager, PackageManager };
