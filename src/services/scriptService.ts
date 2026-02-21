/**
 * Service to read and execute npm scripts from package.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { PackageJson } from '../core/types';

export interface NpmScript {
  name: string;
  command: string;
}

export function extractScriptsFromPackageJson(packageJson: PackageJson): NpmScript[] {
  const scripts = packageJson.scripts || {};
  return Object.entries(scripts).map(([name, command]) => ({
    name,
    command
  }));
}

/**
 * Read scripts from package.json
 */
export async function readScripts(projectPath: string): Promise<NpmScript[]> {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content) as PackageJson;
    return extractScriptsFromPackageJson(packageJson);
  } catch {
    return [];
  }
}

/**
 * Get common scripts first, then alphabetical
 */
export function sortScripts(scripts: NpmScript[]): NpmScript[] {
  const priorityOrder = ['dev', 'start', 'build', 'test', 'lint', 'preview', 'deploy'];
  
  return [...scripts].sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a.name);
    const bIndex = priorityOrder.indexOf(b.name);
    
    // If both are in priority list, sort by priority
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    
    // If only a is in priority list, a comes first
    if (aIndex !== -1) return -1;
    
    // If only b is in priority list, b comes first
    if (bIndex !== -1) return 1;
    
    // Otherwise, alphabetical
    return a.name.localeCompare(b.name);
  });
}
