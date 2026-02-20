/**
 * Punto de entrada principal de la extensión NPM Visual Manager
 */

import * as vscode from 'vscode';
import { NpmGuiManagerPanel } from './webviewPanel';

export function activate(context: vscode.ExtensionContext): void {
  console.log('NPM GUI Manager extension is now active');

  const disposable = vscode.commands.registerCommand(
    'npm-visual-manager.openManager',
    async () => {
      // Verificar que hay un workspace abierto
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
          'NPM GUI Manager: No workspace folder is open. Please open a folder containing a package.json file.'
        );
        return;
      }

      // Usar el primer workspace folder
      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      try {
        await NpmGuiManagerPanel.createOrShow(context.extensionUri, workspaceRoot);
      } catch (error) {
        vscode.window.showErrorMessage(
          `NPM GUI Manager: Failed to open manager - ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  console.log('NPM GUI Manager extension is now deactivated');
}
