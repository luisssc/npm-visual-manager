import { exec } from 'child_process';

export function executeShellCommand(
  command: string,
  timeout: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    });
  });
}
