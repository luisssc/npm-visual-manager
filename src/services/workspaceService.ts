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

/**
 * Find all package.json files in workspace
 */
export async function findAllProjects(workspaceRoot: string): Promise<Project[]> {
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

  // Search in subdirectories (max depth 3 for performance)
  await searchDirectories(workspaceRoot, workspaceRoot, 0, 3, projects);

  return projects;
}

async function searchDirectories(
  currentDir: string,
  workspaceRoot: string,
  currentDepth: number,
  maxDepth: number,
  projects: Project[]
): Promise<void> {
  if (currentDepth >= maxDepth) {
    return;
  }

  try {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
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
        } else {
          // Recurse into subdirectory
          await searchDirectories(fullPath, workspaceRoot, currentDepth + 1, maxDepth, projects);
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
