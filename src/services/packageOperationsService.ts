import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { HostToWebviewMessage, UpdateHistory } from '../../types';
import { runCommand } from '../utils/commandRunner';
import { clearAuditCache } from './auditService';
import { getInstallCommand, getPackageManagerInfo, getUninstallCommand, PackageManager } from './packageManagerService';
import { getInstalledVersion, getInstalledVersions } from './installedVersionService';

export class PackageOperationsService {
  constructor(
    private readonly sendMessage: (message: HostToWebviewMessage) => void,
    private readonly reloadDependencies: () => Promise<void>,
    private readonly setUpdateHistory: (history: UpdateHistory | null) => void
  ) {}

  /**
   * Update a specific package
   */
  public async updatePackage(
    packageName: string,
    version: string,
    currentVersion: string | undefined,
    currentProjectPath: string,
    currentPackageManager: PackageManager
  ): Promise<UpdateHistory | null> {
    let newHistory: UpdateHistory | null = null;

    // Get exact installed version from node_modules before updating
    const exactVersion = await getInstalledVersion(currentProjectPath, packageName);

    // Save to history before updating (use declared version for rollback)
    if (currentVersion) {
      newHistory = {
        timestamp: Date.now(),
        packages: [
          {
            name: packageName,
            previousDeclaredVersion: currentVersion, // e.g. "^5"
            previousInstalledVersion: exactVersion || currentVersion, // e.g. "5.9.3"
            newVersion: version,
          },
        ],
      };
    }

    // Note: Webview progress message removed - only using VS Code native notifications
    try {
      const installCmd = getInstallCommand(currentPackageManager, packageName, version);

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Updating ${packageName}...`,
          cancellable: false,
        },
        async () => {
          return await runCommand(installCmd, {
            cwd: currentProjectPath,
            label: `Update ${packageName}@${version}`,
          });
        }
      );

      clearAuditCache(currentProjectPath);
      if (result.exitCode === 0) {
        this.setUpdateHistory(newHistory);
      }

      // Small delay to ensure file system is synced
      await new Promise(resolve => setTimeout(resolve, 300));
      await this.reloadDependencies();

      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `Update failed for ${packageName} with exit code ${result.exitCode}. Check the Output channel for details.`
        );
      }

      this.sendMessage({
        type: 'UPDATE_RESULT',
        success: result.exitCode === 0,
        packageName,
        message:
          result.exitCode === 0
            ? `Successfully updated ${packageName}`
            : `Update finished with exit code ${result.exitCode}`,
      });

      return result.exitCode === 0 ? newHistory : null;
    } catch (error) {
      this.sendMessage({
        type: 'UPDATE_RESULT',
        success: false,
        packageName,
        message: `Failed to update ${packageName}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return null;
    }
  }

  /**
   * Update multiple packages at once
   */
  public async updateAllPackages(
    packages: { name: string; version: string; currentVersion?: string }[],
    currentProjectPath: string,
    currentPackageManager: PackageManager
  ): Promise<UpdateHistory | null> {
    if (packages.length === 0) {
      vscode.window.showInformationMessage('No packages to update');
      return null;
    }

    const packageList = packages.map(p => `${p.name}@${p.version}`).join(' ');

    // Get exact installed versions from node_modules before updating
    const packageNames = packages.map(p => p.name);
    const installedVersions = await getInstalledVersions(currentProjectPath, packageNames);

    // Save to history before updating (use declared versions for rollback)
    const newHistory: UpdateHistory = {
      timestamp: Date.now(),
      packages: packages
        .filter(p => p.currentVersion)
        .map(p => ({
          name: p.name,
          previousDeclaredVersion: p.currentVersion!, // e.g. "^5"
          previousInstalledVersion: installedVersions.get(p.name) || p.currentVersion!,
          newVersion: p.version,
        })),
    };

    // Note: Webview progress message removed - only using VS Code native notifications
    try {
      const info = getPackageManagerInfo(currentPackageManager);
      const command = `${info.addCommand} ${packageList}`;

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Updating ${packages.length} package(s)...`,
          cancellable: false,
        },
        async () => {
          return await runCommand(command, {
            cwd: currentProjectPath,
            label: `Update ${packages.length} package(s)`,
          });
        }
      );

      clearAuditCache(currentProjectPath);
      if (result.exitCode === 0) {
        this.setUpdateHistory(newHistory);
      }

      // Small delay to ensure file system is synced
      await new Promise(resolve => setTimeout(resolve, 300));
      await this.reloadDependencies();

      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `Update failed for ${packages.length} package(s) with exit code ${result.exitCode}. Check the Output channel for details.`
        );
      }

      this.sendMessage({
        type: 'UPDATE_RESULT',
        success: result.exitCode === 0,
        packageName: packages.map(p => p.name).join(', '),
        message:
          result.exitCode === 0
            ? `Successfully updated ${packages.length} package(s)`
            : `Update finished with exit code ${result.exitCode}`,
      });

      return result.exitCode === 0 ? newHistory : null;
    } catch (error) {
      this.sendMessage({
        type: 'UPDATE_RESULT',
        success: false,
        packageName: packages.map(p => p.name).join(', '),
        message: `Failed to update packages: ${error instanceof Error ? error.message : String(error)}`,
      });
      vscode.window.showErrorMessage(
        `Failed to update packages: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Uninstall a package
   */
  public async uninstallPackage(
    packageName: string,
    currentProjectPath: string,
    currentPackageManager: PackageManager
  ): Promise<void> {
    try {
      // Get exact installed version before uninstalling so we can rollback
      const exactVersion = await getInstalledVersion(currentProjectPath, packageName);

      const newHistory: UpdateHistory | null = exactVersion
        ? {
            timestamp: Date.now(),
            packages: [
              {
                name: packageName,
                previousDeclaredVersion: exactVersion,
                previousInstalledVersion: exactVersion,
                newVersion: 'uninstalled',
              },
            ],
          }
        : null;

      const uninstallCmd = getUninstallCommand(currentPackageManager, packageName);

      // Note: Webview progress message removed - only using VS Code native notifications
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Uninstalling ${packageName}...`,
          cancellable: false,
        },
        async () => {
          return await runCommand(uninstallCmd, {
            cwd: currentProjectPath,
            label: `Uninstall ${packageName}`,
          });
        }
      );

      if (result.exitCode === 0 && newHistory) {
        this.setUpdateHistory(newHistory);
      }

      // Small delay to ensure file system is synced
      await new Promise(resolve => setTimeout(resolve, 300));
      await this.reloadDependencies();

      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `Uninstall failed for ${packageName} with exit code ${result.exitCode}. Check the Output channel for details.`
        );
      }

      this.sendMessage({
        type: 'UNINSTALL_RESULT',
        packageName,
        success: result.exitCode === 0,
        message:
          result.exitCode === 0
            ? `Successfully uninstalled ${packageName}`
            : `Uninstall finished with exit code ${result.exitCode}`,
      });
    } catch (error) {
      this.sendMessage({
        type: 'UNINSTALL_RESULT',
        packageName,
        success: false,
        message: `Failed to uninstall ${packageName}: ${error instanceof Error ? error.message : String(error)}`,
      });
      vscode.window.showErrorMessage(
        `Failed to uninstall package: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Install a new package
   */
  public async installNewPackage(
    packageName: string,
    version: string,
    isDev: boolean,
    currentProjectPath: string,
    currentPackageManager: PackageManager
  ): Promise<void> {
    try {
      const info = getPackageManagerInfo(currentPackageManager);
      const devFlag = isDev ? info.devFlag || '--save-dev' : '';
      const versionSuffix = version ? `@${version}` : '';
      const command = `${info.addCommand} ${packageName}${versionSuffix} ${devFlag}`.trim();

      // Note: Webview progress message removed - only using VS Code native notifications
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Installing ${packageName}...`,
          cancellable: false,
        },
        async () => {
          return await runCommand(command, {
            cwd: currentProjectPath,
            label: `Install ${packageName}${versionSuffix}`,
          });
        }
      );

      // Small delay to ensure file system is synced
      await new Promise(resolve => setTimeout(resolve, 300));
      await this.reloadDependencies();

      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `Install failed for ${packageName} with exit code ${result.exitCode}. Check the Output channel for details.`
        );
      }

      this.sendMessage({
        type: 'INSTALL_RESULT',
        success: result.exitCode === 0,
        packageName,
        message:
          result.exitCode === 0
            ? `Successfully installed ${packageName}`
            : `Install finished with exit code ${result.exitCode}`,
      });
    } catch (error) {
      this.sendMessage({
        type: 'INSTALL_RESULT',
        success: false,
        packageName,
        message: `Failed to install ${packageName}: ${error instanceof Error ? error.message : String(error)}`,
      });
      vscode.window.showErrorMessage(
        `Failed to install package: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Rollback the last update operation
   */
  public async rollbackLastUpdate(
    updateHistory: UpdateHistory | null,
    currentProjectPath: string,
    currentPackageManager: PackageManager
  ): Promise<void> {
    if (!updateHistory || updateHistory.packages.length === 0) {
      this.sendMessage({
        type: 'ROLLBACK_RESULT',
        success: false,
        message: 'No previous update to rollback',
      });
      return;
    }

    const packagesToRollback = updateHistory.packages;

    // Note: Webview progress message removed - only using VS Code native notifications
    try {
      const info = getPackageManagerInfo(currentPackageManager);

      // Install using the EXACT installed version to get the right package
      // We'll restore the declared version in package.json after
      const installArgs = packagesToRollback.map(p => `${p.name}@${p.previousInstalledVersion}`).join(' ');
      const command = `${info.addCommand} ${installArgs}`;

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Rolling back ${packagesToRollback.length} package(s)...`,
          cancellable: false,
        },
        async () => {
          return await runCommand(command, {
            cwd: currentProjectPath,
            label: `Rollback ${packagesToRollback.length} package(s)`,
          });
        }
      );

      if (result.exitCode !== 0) {
        throw new Error(`Rollback finished with exit code ${result.exitCode}. Check output channel.`);
      }

      clearAuditCache(currentProjectPath);
      await this.restorePackageJsonVersions(packagesToRollback, currentProjectPath);
      this.setUpdateHistory(null); // Clear history immediately on successful rollback
      await this.reloadDependencies();

      // Clear history after successful rollback
      const rolledBackPackages = packagesToRollback.map(p => p.name);

      this.sendMessage({
        type: 'ROLLBACK_RESULT',
        success: true,
        message: `Successfully rolled back ${packagesToRollback.length} package(s)`,
        rolledBackPackages,
      });
    } catch (error) {
      this.sendMessage({
        type: 'ROLLBACK_RESULT',
        success: false,
        message: `Failed to rollback: ${error instanceof Error ? error.message : String(error)}`,
      });
      vscode.window.showErrorMessage(`Failed to rollback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Restore declared versions in package.json after rollback
   * This preserves the original format (^, ~, exact versions, etc.)
   */
  private async restorePackageJsonVersions(
    packages: Array<{
      name: string;
      previousDeclaredVersion: string;
      previousInstalledVersion: string;
      newVersion: string;
    }>,
    currentProjectPath: string
  ): Promise<void> {
    try {
      const packageJsonPath = path.join(currentProjectPath, 'package.json');
      const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);

      for (const { name, previousDeclaredVersion } of packages) {
        // Find which dependency type this package is in
        if (pkg.dependencies && name in pkg.dependencies) {
          pkg.dependencies[name] = previousDeclaredVersion;
        } else if (pkg.devDependencies && name in pkg.devDependencies) {
          pkg.devDependencies[name] = previousDeclaredVersion;
        } else if (pkg.peerDependencies && name in pkg.peerDependencies) {
          pkg.peerDependencies[name] = previousDeclaredVersion;
        }
      }

      // Write back with proper formatting
      await fs.promises.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    } catch (error) {
      console.error('[npm-visual-manager] Failed to restore package.json versions:', error);
      // Don't throw - the rollback technically succeeded, just package.json wasn't restored
    }
  }
}
