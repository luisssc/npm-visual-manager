/**
 * Service for running npm audit and parsing results
 */

import { exec } from 'child_process';
import { promisify } from 'util';

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
 * Run npm audit and parse the results
 */
export async function runNpmAudit(projectPath: string): Promise<AuditResult> {
  try {
    const { stdout } = await execAsync('npm audit --json', {
      cwd: projectPath,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large audits
    });

    return parseAuditResult(stdout);
  } catch (error) {
    // npm audit returns exit code 1 when vulnerabilities are found
    // but still outputs valid JSON
    if (error instanceof Error && 'stdout' in error) {
      const stdout = (error as { stdout: string }).stdout;
      if (stdout) {
        return parseAuditResult(stdout);
      }
    }
    throw error;
  }
}

function parseAuditResult(jsonOutput: string): AuditResult {
  const audit = JSON.parse(jsonOutput);
  
  const vulnerabilities: Vulnerability[] = [];
  
  // Parse advisories (npm 6/7 format)
  if (audit.advisories) {
    for (const [id, advisory] of Object.entries(audit.advisories)) {
      const adv = advisory as {
        module_name: string;
        title: string;
        severity: string;
        vulnerable_versions: string;
        patched_versions: string;
        overview: string;
      };
      vulnerabilities.push({
        id,
        title: adv.title,
        severity: adv.severity as Vulnerability['severity'],
        packageName: adv.module_name,
        vulnerableVersions: adv.vulnerable_versions,
        patchedVersions: adv.patched_versions,
        overview: adv.overview
      });
    }
  }
  
  // Parse vulnerabilities (npm 8+ format)
  if (audit.vulnerabilities) {
    for (const [packageName, vuln] of Object.entries(audit.vulnerabilities)) {
      const v = vuln as {
        severity: string;
        via: Array<{ title: string; range: string }> | string;
        effects: string[];
        nodes: string[];
        fixAvailable: boolean;
      };
      
      const title = Array.isArray(v.via) && v.via.length > 0 && typeof v.via[0] === 'object' 
        ? v.via[0].title 
        : `Vulnerability in ${packageName}`;
        
      const vulnerableVersions = Array.isArray(v.via) && v.via.length > 0 && typeof v.via[0] === 'object'
        ? v.via[0].range
        : '*';
      
      vulnerabilities.push({
        id: `${packageName}-${v.severity}`,
        title,
        severity: v.severity as Vulnerability['severity'],
        packageName,
        vulnerableVersions,
        patchedVersions: v.fixAvailable ? 'Available' : 'Not available',
        overview: title
      });
    }
  }

  const metadata = audit.metadata || {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    totalDependencies: 0
  };

  return {
    vulnerabilities,
    metadata: {
      vulnerabilities: metadata.vulnerabilities || { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
      totalDependencies: metadata.totalDependencies || 0
    }
  };
}

/**
 * Get vulnerability count for a specific package
 */
export function getPackageVulnerabilityCount(
  auditResult: AuditResult, 
  packageName: string
): number {
  return auditResult.vulnerabilities.filter(v => 
    v.packageName === packageName
  ).length;
}

/**
 * Check if a package has vulnerabilities
 */
export function hasVulnerabilities(
  auditResult: AuditResult,
  packageName: string
): boolean {
  return auditResult.vulnerabilities.some(v => 
    v.packageName === packageName
  );
}
