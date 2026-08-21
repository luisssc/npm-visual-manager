/**
 * Service that computes workspace-wide counts of available updates and
 * vulnerable packages, used for the activity bar badge.
 *
 * Kept free of any 'vscode' runtime dependency so it can be unit tested;
 * configuration (enabled flag, ignore list) is injected by the caller.
 */

import type { PackageJson } from '../../types';
import { findPackageJson, readPackageJson } from './packageService';
import { getPackageDetails, getSemverUpdateType, setGlobalCache } from './npmService';
import { getCache } from './cacheService';
import { runAudit } from './auditService';
import { findAllProjectsMultiRoot, ScanOptions } from './workspaceService';
import { isLocalPackageVersion } from '../utils/localPackage';

/** Per-project counts, so the workspace total can be attributed to a file. */
export interface BadgeProjectSummary {
  /** package.json "name", or the folder name when absent */
  name: string;
  /** Absolute path of the project folder */
  path: string;
  /** Path relative to the workspace root ('.' for the root project) */
  relativePath: string;
  updates: number;
  vulnerablePackages: number;
}

export interface BadgeSummary {
  updates: number;
  vulnerablePackages: number;
  /**
   * Breakdown of the totals above, one entry per discovered package.json.
   * The workspace total says nothing about *which* project needs work, which
   * is confusing in repos holding many package.json files.
   */
  projects?: BadgeProjectSummary[];
}

export interface BadgeCheckOptions {
  /** Predicate for packages excluded from update checks (ignore list) */
  isIgnored?: (packageName: string) => boolean;
  /** Max parallel registry requests per batch */
  batchSize?: number;
  /** Depth/exclusions used to discover package.json files */
  scan?: ScanOptions;
}

const DEFAULT_BATCH_SIZE = 5;

/**
 * Collect direct dependencies (prod + dev + peer) as a name -> declaredVersion map.
 * First occurrence wins, matching the deduplication used by the panel.
 */
export function collectDirectDependencies(packageJson: PackageJson): Map<string, string> {
  const result = new Map<string, string>();
  const sections = [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies];

  for (const section of sections) {
    if (!section) {
      continue;
    }
    for (const [name, version] of Object.entries(section)) {
      if (!result.has(name)) {
        result.set(name, version);
      }
    }
  }

  return result;
}

/**
 * Count how many direct dependencies of a project have an update available.
 * Ignored and local/workspace/git packages are skipped.
 * Returns the update count plus the full set of direct dependency names
 * (used later to match audit results against direct dependencies).
 */
export async function countProjectUpdates(
  projectPath: string,
  options: BadgeCheckOptions = {}
): Promise<{ updates: number; directDependencies: Set<string> }> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const isIgnored = options.isIgnored ?? (() => false);

  const packageJsonPath = await findPackageJson(projectPath);
  if (!packageJsonPath) {
    return { updates: 0, directDependencies: new Set() };
  }

  let packageJson: PackageJson;
  try {
    packageJson = await readPackageJson(packageJsonPath);
  } catch {
    return { updates: 0, directDependencies: new Set() };
  }

  const directDeps = collectDirectDependencies(packageJson);
  const candidates = Array.from(directDeps.entries()).filter(
    ([name, version]) => !isIgnored(name) && !isLocalPackageVersion(version)
  );

  let updates = 0;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async ([name, declaredVersion]) => {
        try {
          const details = await getPackageDetails(name);
          const updateType = getSemverUpdateType(declaredVersion, details.latestVersion);
          if (updateType === 'major' || updateType === 'minor' || updateType === 'patch') {
            updates++;
          }
        } catch {
          // Unresolvable package (private registry, network error): not counted
        }
      })
    );
  }

  return { updates, directDependencies: new Set(directDeps.keys()) };
}

/**
 * Compute the badge summary for the whole workspace:
 * - updates: sum of available updates across every discovered project
 * - vulnerablePackages: sum, per project, of direct dependencies reported as
 *   vulnerable by that project's own audit (each project may have its own
 *   lockfile, so the audit must run where the panel would run it)
 */
export async function computeWorkspaceBadge(
  workspaceRoots: string[],
  options: BadgeCheckOptions = {}
): Promise<BadgeSummary> {
  if (workspaceRoots.length === 0) {
    return { updates: 0, vulnerablePackages: 0 };
  }

  // Reuse the persistent version cache so activation-time checks are cheap.
  // Registry data is project-independent, so sharing one cache file is safe
  // even if the panel later installs its own cache instance.
  const cache = getCache(workspaceRoots[0]!);
  await cache.load();
  setGlobalCache(cache);

  const projects = await findAllProjectsMultiRoot(workspaceRoots, options.scan);

  let updates = 0;
  let vulnerablePackages = 0;
  const perProject: BadgeProjectSummary[] = [];

  for (const project of projects) {
    const result = await countProjectUpdates(project.path, options);
    updates += result.updates;

    let vulnerableInThisProject = 0;
    try {
      const audit = await runAudit(project.path);
      const vulnerableInProject = new Set<string>();
      for (const vulnerability of audit.vulnerabilities) {
        if (result.directDependencies.has(vulnerability.packageName)) {
          vulnerableInProject.add(vulnerability.packageName);
        }
      }
      vulnerableInThisProject = vulnerableInProject.size;
      vulnerablePackages += vulnerableInThisProject;
    } catch {
      // Audit failure must never break the badge
    }

    perProject.push({
      name: project.name,
      path: project.path,
      relativePath: project.relativePath,
      updates: result.updates,
      vulnerablePackages: vulnerableInThisProject,
    });
  }

  await cache.save();

  return { updates, vulnerablePackages, projects: perProject };
}
