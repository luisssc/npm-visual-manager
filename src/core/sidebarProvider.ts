/**
 * Sidebar provider for npm-visual-manager
 * Enhanced welcome view with quick actions and useful info
 */

import * as vscode from 'vscode';
import { getNonce } from '../utils/nonce';
import { getVSCodeLanguage } from '../i18n/getLanguage';
import { getTranslations } from '../i18n';

const EXTENSION_VERSION = '1.4.0';

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
      switch (message.type) {
        case 'OPEN_PANEL':
          await vscode.commands.executeCommand('npm-visual-manager.openManager');
          break;
        case 'OPEN_DOCS':
          await vscode.env.openExternal(vscode.Uri.parse('https://github.com/luisssc/npm-visual-manager#readme'));
          break;
        case 'OPEN_ISSUES':
          await vscode.env.openExternal(vscode.Uri.parse('https://github.com/luisssc/npm-visual-manager/issues'));
          break;
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
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 20px 16px;
      margin: 0;
      line-height: 1.5;
    }
    
    .welcome-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    
    .logo {
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, #CB3837 0%, #E53935 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      box-shadow: 0 4px 12px rgba(203, 56, 55, 0.3);
      margin-bottom: 4px;
    }
    
    .title {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
      color: var(--vscode-foreground);
      text-align: center;
      width: 100%;
    }
    
    .version {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
      padding: 2px 8px;
      border-radius: 10px;
      margin-top: -8px;
    }
    
    .description {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      margin: 8px 0;
      text-align: center;
      line-height: 1.5;
    }
    
    .primary-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s ease;
      width: 100%;
      justify-content: center;
    }
    
    .primary-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    .primary-btn::before {
      content: "▶";
      font-size: 10px;
    }
    
    .shortcut-hint {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      margin-top: 8px;
      padding: 8px;
      border-radius: 4px;
      width: 100%;
      line-height: 2.3;
    }
    
    .shortcut-hint kbd {
      background: var(--vscode-keybindingLabel-background);
      border: 1px solid var(--vscode-keybindingLabel-border);
      border-bottom-color: var(--vscode-keybindingLabel-bottomBorder);
      border-radius: 3px;
      padding: 2px 6px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      box-shadow: inset 0 -1px 0 var(--vscode-keybindingLabel-bottomBorder);
    }
    
    .divider {
      width: 100%;
      height: 1px;
      background: var(--vscode-widget-border);
      margin: 16px 0 12px 0;
      opacity: 0.5;
    }
    
    .links-section {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .links-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      letter-spacing: 0.5px;
    }
    
    .link-btn {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border: 1px solid var(--vscode-button-secondaryHoverBackground);
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    
    .link-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      border-color: var(--vscode-textLink-activeForeground);
    }
    
    .tips-section {
      width: 100%;
      margin-top: 8px;
      padding: 12px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
      border-radius: 0 4px 4px 0;
    }
    
    .tips-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 6px;
    }
    
    .tip-item {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin: 4px 0;
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    
    .tip-item::before {
      content: "💡";
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="welcome-container">
    <div class="logo">📦</div>
    <p class="title">NPM Visual Manager</p>
    <span class="version">v${EXTENSION_VERSION}</span>
    
    <p class="description">
      ${t.sidebar.description}
    </p>
    
    <button class="primary-btn" id="openBtn">
      ${t.sidebar.openButton}
    </button>
    
    <div class="shortcut-hint">
      ${t.sidebar.shortcut}
    </div>
    
    <div class="divider"></div>
    
    <div class="links-section">
      <span class="links-title">${t.sidebar.quickLinks}</span>
      <button class="link-btn" id="docsBtn">
        📖 ${t.sidebar.documentation}
      </button>
      <button class="link-btn" id="issuesBtn">
        🐛 ${t.sidebar.reportIssue}
      </button>
    </div>
    
    <div class="tips-section">
      <div class="tips-title">${t.sidebar.proTips}</div>
      <div class="tip-item">${t.sidebar.tip1}</div>
      <div class="tip-item">${t.sidebar.tip2}</div>
    </div>
  </div>
  
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    document.getElementById('openBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'OPEN_PANEL' });
    });
    
    document.getElementById('docsBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'OPEN_DOCS' });
    });
    
    document.getElementById('issuesBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'OPEN_ISSUES' });
    });
  </script>
</body>
</html>`;
  }
}
