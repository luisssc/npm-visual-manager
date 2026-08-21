/**
 * Reads the workspace scan settings that decide which package.json files the
 * extension discovers. Kept apart from `workspaceService`, which stays free of
 * any 'vscode' dependency so it can be unit tested.
 */

import * as vscode from 'vscode';
import { DEFAULT_EXCLUDED_DIRECTORIES, DEFAULT_MAX_DEPTH, ScanOptions } from './workspaceService';

export function getScanOptions(): ScanOptions {
  const config = vscode.workspace.getConfiguration('npm-visual-manager');
  const maxDepth = config.get<number>('scan.maxDepth', DEFAULT_MAX_DEPTH);
  const exclude = config.get<string[]>('scan.excludeFolders', DEFAULT_EXCLUDED_DIRECTORIES);

  return {
    maxDepth: Number.isFinite(maxDepth) && maxDepth > 0 ? maxDepth : DEFAULT_MAX_DEPTH,
    exclude: Array.isArray(exclude) ? exclude : DEFAULT_EXCLUDED_DIRECTORIES,
  };
}
