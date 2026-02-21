/**
 * Service for calculating package sizes in node_modules
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Calculate the size of a directory recursively
 */
function getDirectorySize(dirPath: string): number {
  let size = 0;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch {
    // Directory might not exist or be accessible
    return 0;
  }
  
  return size;
}

/**
 * Format bytes to human readable string
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) {return '-'}
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

/**
 * Get the size of a package in node_modules
 */
export function getPackageSize(workspaceRoot: string, packageName: string): string {
  const packagePath = path.join(workspaceRoot, 'node_modules', packageName);
  
  try {
    const stats = fs.statSync(packagePath);
    if (!stats.isDirectory()) {
      return '-';
    }
    
    const sizeInBytes = getDirectorySize(packagePath);
    return formatSize(sizeInBytes);
  } catch {
    return '-';
  }
}

/**
 * Get sizes for all dependencies
 */
export function getAllPackageSizes(
  workspaceRoot: string,
  dependencies: Array<{ name: string }>
): Map<string, string> {
  const sizes = new Map<string, string>();
  
  for (const dep of dependencies) {
    const size = getPackageSize(workspaceRoot, dep.name);
    sizes.set(dep.name, size);
  }
  
  return sizes;
}
