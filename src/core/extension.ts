/**
 * Main entry point for npm-visual-manager extension
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { NpmGuiManagerPanel } from './webviewPanel';
import { setGlobalStorageUri } from '../services/cacheService';
import { NpmDependenciesProvider } from './sidebarProvider';

export function activate(context: vscode.ExtensionContext): void {
  console.log('npm-visual-manager extension is now active');

  // Set global storage URI for cache service
  setGlobalStorageUri(context.globalStorageUri);

  // Register the main command (opens in panel)
  const openManagerCommand = vscode.commands.registerCommand(
    'npm-visual-manager.openManager',
    async (resource?: vscode.Uri) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
          'npm-visual-manager: No workspace folder is open. Please open a folder containing a package.json file.'
        );
        return;
      }

      let workspaceRoot = workspaceFolders[0]!.uri.fsPath;
      let preferredProjectPath: string | undefined;

      const activeUri = resource || vscode.window.activeTextEditor?.document.uri;
      if (activeUri && activeUri.scheme === 'file') {
        const folder = vscode.workspace.getWorkspaceFolder(activeUri);
        if (folder) {
          workspaceRoot = folder.uri.fsPath;
        }

        const isPackageJson = path.basename(activeUri.fsPath).toLowerCase() === 'package.json';
        preferredProjectPath = isPackageJson ? path.dirname(activeUri.fsPath) : activeUri.fsPath;
      }

      try {
        await NpmGuiManagerPanel.createOrShow(
          context.extensionUri,
          context.globalStorageUri,
          workspaceRoot,
          preferredProjectPath
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `npm-visual-manager: Failed to open manager - ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Register refresh command
  const refreshCommand = vscode.commands.registerCommand('npm-visual-manager.refresh', async () => {
    vscode.window.showInformationMessage('Refreshing dependencies...');
    vscode.commands.executeCommand('npm-visual-manager.openManager');
  });

  // Register sidebar webview provider
  const sidebarProvider = new NpmDependenciesProvider();
  const sidebarDisposable = vscode.window.registerWebviewViewProvider('npm-visual-manager.sidebar', sidebarProvider, {
    webviewOptions: {
      retainContextWhenHidden: true,
    },
  });

  context.subscriptions.push(openManagerCommand);
  context.subscriptions.push(refreshCommand);
  context.subscriptions.push(sidebarDisposable);
}

export function deactivate(): void {
  console.log('npm-visual-manager extension is now deactivated');
}
