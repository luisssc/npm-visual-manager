import { describe, it, expect } from 'vitest';
import { findPackageJson, readPackageJson } from '../packageService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('findPackageJson', () => {
  it('returns null when package.json does not exist', async () => {
    const result = await findPackageJson('/nonexistent/path');
    expect(result).toBeNull();
  });

  it('returns path when package.json exists', async () => {
    // Create a temporary directory with package.json
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-vm-test-'));
    const packageJsonPath = path.join(tmpDir, 'package.json');
    await fs.promises.writeFile(packageJsonPath, JSON.stringify({ name: 'test' }));

    const result = await findPackageJson(tmpDir);
    expect(result).toBe(packageJsonPath);

    // Cleanup
    await fs.promises.unlink(packageJsonPath);
    await fs.promises.rmdir(tmpDir);
  });
});

describe('readPackageJson', () => {
  it('reads and parses valid package.json', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-vm-test-'));
    const packageJsonPath = path.join(tmpDir, 'package.json');
    const packageData = {
      name: 'test-package',
      version: '1.0.0',
      dependencies: { lodash: '^4.17.0' },
    };
    await fs.promises.writeFile(packageJsonPath, JSON.stringify(packageData));

    const result = await readPackageJson(packageJsonPath);
    expect(result).toEqual(packageData);

    // Cleanup
    await fs.promises.unlink(packageJsonPath);
    await fs.promises.rmdir(tmpDir);
  });

  it('throws on invalid JSON', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-vm-test-'));
    const packageJsonPath = path.join(tmpDir, 'package.json');
    await fs.promises.writeFile(packageJsonPath, 'invalid json');

    await expect(readPackageJson(packageJsonPath)).rejects.toThrow();

    // Cleanup
    await fs.promises.unlink(packageJsonPath);
    await fs.promises.rmdir(tmpDir);
  });
});
