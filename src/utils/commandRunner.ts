/**
 * Command runner utility for executing shell commands with real completion detection.
 * Uses child_process.spawn to stream output to a VS Code OutputChannel
 * and returns a Promise that resolves only when the command finishes.
 */

import * as vscode from 'vscode';
import { spawn } from 'child_process';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  /** Working directory for the command */
  cwd: string;
  /** Timeout in milliseconds (default: 120000 = 2 min) */
  timeout?: number;
  /** Whether to show the output channel automatically (default: true) */
  showOutput?: boolean;
  /** Label shown in the output channel before the command runs */
  label?: string;
}

const DEFAULT_TIMEOUT = 120_000;
let outputChannel: vscode.OutputChannel | null = null;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('NPM Visual Manager');
  }
  return outputChannel;
}

/**
 * Run a shell command and wait for it to finish.
 * Output is streamed in real-time to the VS Code OutputChannel.
 */
export function runCommand(command: string, options: RunCommandOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const channel = getOutputChannel();
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    if (options.showOutput !== false) {
      channel.show(true); // true = preserve focus on editor
    }

    // Log command header
    const label = options.label ?? command;
    channel.appendLine('');
    channel.appendLine(`▶ ${label}`);
    channel.appendLine(`  cwd: ${options.cwd}`);
    channel.appendLine('─'.repeat(60));

    // Use shell: true so we can pass the full command string
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellFlag = isWindows ? '/c' : '-c';

    const child = spawn(shell, [shellFlag, command], {
      cwd: options.cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (result: CommandResult | Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };

    // Timeout handling
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      channel.appendLine(`\n✖ Command timed out after ${timeout / 1000}s`);
      settle(new Error(`Command timed out after ${timeout / 1000}s: ${command}`));
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      channel.append(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      channel.append(text);
    });

    child.on('error', error => {
      channel.appendLine(`\n✖ Error: ${error.message}`);
      settle(error);
    });

    child.on('close', code => {
      const exitCode = code ?? 1;
      channel.appendLine('');
      channel.appendLine(`─ Finished with exit code ${exitCode}`);
      settle({ exitCode, stdout, stderr });
    });
  });
}

/**
 * Dispose the output channel when the extension deactivates.
 */
export function disposeOutputChannel(): void {
  if (outputChannel) {
    outputChannel.dispose();
    outputChannel = null;
  }
}
