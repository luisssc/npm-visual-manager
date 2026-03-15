/**
 * Sidebar provider for npm-visual-manager
 * Shows a welcome view with button to open full panel
 */

import * as vscode from 'vscode';
import { getNonce } from '../utils/nonce';
import { getVSCodeLanguage } from '../i18n/getLanguage';
import { getTranslations } from '../i18n';

export class NpmDependenciesProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'npm-visual-manager.sidebar';

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.type === 'OPEN_PANEL') {
        await vscode.commands.executeCommand('npm-visual-manager.openManager');
      }
    });
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    const nonce = getNonce();
    const language = getVSCodeLanguage();
    const t = getTranslations(language);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>NPM Visual Manager</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 20px;
      text-align: center;
    }
    .welcome-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 8px;
    }
    .title {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }
    .description {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      margin: 0;
      line-height: 1.5;
    }
    .open-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 24px;
      border-radius: 2px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 8px;
    }
    .open-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .shortcut {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 12px;
      line-height: 2;
      text-align: center;
      padding: 0 10px;
    }
    kbd {
      background: var(--vscode-keybindingLabel-background);
      border: 1px solid var(--vscode-keybindingLabel-border);
      border-radius: 3px;
      padding: 1px 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      vertical-align: 1px;
      margin: 0 1px;
    }
  </style>
</head>
<body>
  <div class="welcome-container">
    <div class="icon">📦</div>
    <p class="title">NPM Visual Manager</p>
    <p class="description">
      ${t.sidebar.description}
    </p>
    <button class="open-btn" id="openBtn">${t.sidebar.openButton}</button>
    <p class="shortcut">
      ${t.sidebar.shortcut}
    </p>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('openBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'OPEN_PANEL' });
    });
  </script>
</body>
</html>`;
  }
}
