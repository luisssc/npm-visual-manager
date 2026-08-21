/**
 * Service for detecting multiple projects in workspace
 */

import * as path from 'path';
import * as fs from 'fs';

export interface Project {
  name: string;
  path: string;
  relativePath: string;
}

export interface ScanOptions {
  /** How many directory levels below the workspace root are searched */
  maxDepth?: number;
  /** Directory names never descended into (case-insensitive) */
  exclude?: string[];
}

/**
 * Default depth. Four levels was not enough for common layouts: a Bedrock-style
 * WordPress repo keeps its theme at `web/app/themes/<theme>` (4 levels), so with
 * the previous limit of 3 those package.json files were never discovered and the
 * project could not even be selected.
 */
export const DEFAULT_MAX_DEPTH = 5;

/**
 * Directories that hold dependencies or build output rather than source
 * projects. Descending into them is both slow (a WordPress `vendor/` or
 * `uploads/` tree is huge) and wrong, since any package.json inside is not a
 * project the user maintains.
 */
export const DEFAULT_EXCLUDED_DIRECTORIES = [
  'node_modules',
  'bower_components',
  'vendor',
  'uploads',
  'dist',
  'out',
  'coverage',
  'tmp',
  'temp',
];

/**
 * Find all package.json files in workspace
 */
export async function findAllProjects(workspaceRoot: string, options: ScanOptions = {}): Promise<Project[]> {
  const projects: Project[] = [];

  // Always check root first
  const rootPackageJson = path.join(workspaceRoot, 'package.json');
  if (await fileExists(rootPackageJson)) {
    const name = await getProjectName(rootPackageJson);
    projects.push({
      name,
      path: workspaceRoot,
      relativePath: '.',
    });
  }

  const maxDepth = options.maxDepth && options.maxDepth > 0 ? options.maxDepth : DEFAULT_MAX_DEPTH;
  const exclude = new Set((options.exclude ?? DEFAULT_EXCLUDED_DIRECTORIES).map(name => name.toLowerCase()));

  await searchDirectories(workspaceRoot, workspaceRoot, 0, maxDepth, projects, exclude);

  return projects;
}

async function searchDirectories(
  currentDir: string,
  workspaceRoot: string,
  currentDepth: number,
  maxDepth: number,
  projects: Project[],
  exclude: Set<string>
): Promise<void> {
  if (currentDepth >= maxDepth) {
    return;
  }

  try {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip dependency/output directories and hidden directories
        if (exclude.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        const packageJsonPath = path.join(fullPath, 'package.json');

        if (await fileExists(packageJsonPath)) {
          const name = await getProjectName(packageJsonPath);
          const relativePath = path.relative(workspaceRoot, fullPath);
          projects.push({
            name,
            path: fullPath,
            relativePath,
          });
          // Continue recursing into this directory to find nested packages (e.g. monorepo workspaces)
          await searchDirectories(fullPath, workspaceRoot, currentDepth + 1, maxDepth, projects, exclude);
        } else {
          // Recurse into subdirectory
          await searchDirectories(fullPath, workspaceRoot, currentDepth + 1, maxDepth, projects, exclude);
        }
      }
    }
  } catch {
    // Permission denied or other error, skip this directory
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find all projects across multiple workspace roots (multi-root workspace support)
 */
export async function findAllProjectsMultiRoot(
  workspaceRoots: string[],
  options: ScanOptions = {}
): Promise<Project[]> {
  const allProjects: Project[] = [];
  const seen = new Set<string>();

  for (const root of workspaceRoots) {
    const projects = await findAllProjects(root, options);
    for (const project of projects) {
      const normalized = path.normalize(project.path).toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        allProjects.push(project);
      }
    }
  }

  return allProjects;
}

async function getProjectName(packageJsonPath: string): Promise<string> {
  try {
    const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    if (pkg.name) {
      // Return just the package name, not the folder name
      return pkg.name;
    }
    // Fallback to folder name if no name in package.json
    return path.basename(path.dirname(packageJsonPath));
  } catch {
    return path.basename(path.dirname(packageJsonPath));
  }
}
