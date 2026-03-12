import * as vscode from 'vscode';

export function getVSCodeLanguage(): string {
  return vscode.env.language;
}
