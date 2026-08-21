import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findAllProjects, findAllProjectsMultiRoot, DEFAULT_MAX_DEPTH } from '../workspaceService';

/**
 * These tests run against a real directory tree: discovery is filesystem
 * traversal, and mocking fs here would only assert the mock.
 */
let root: string;

function write(relativePath: string, contents: unknown): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(contents));
}

function relativePaths(projects: { relativePath: string }[]): string[] {
  return projects.map(project => project.relativePath.split(path.sep).join('/')).sort();
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nvm-scan-'));

  // Classic WordPress layout: theme and plugins three levels down
  write('wp-content/themes/mytheme/package.json', { name: 'build' });
  write('wp-content/plugins/plugin-a/package.json', { dependencies: {} });
  // Bedrock-style layout: four levels down
  write('web/app/themes/bedrock-theme/package.json', { name: 'bedrock-theme' });
  // Monorepo-style nested package inside another package
  write('packages/ui/package.json', { name: 'ui' });
  write('packages/ui/tools/generator/package.json', { name: 'generator' });
  // Must never be reported
  write('node_modules/left-pad/package.json', { name: 'left-pad' });
  write('vendor/composer/pkg/package.json', { name: 'composer-pkg' });
  write('wp-content/uploads/2026/08/package.json', { name: 'upload' });
  write('.hidden/tool/package.json', { name: 'hidden' });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('findAllProjects', () => {
  it('finds projects nested four levels deep (Bedrock-style WordPress repos)', async () => {
    const projects = await findAllProjects(root);

    expect(relativePaths(projects)).toContain('web/app/themes/bedrock-theme');
  });

  it('finds every source project and skips dependency, output and hidden folders', async () => {
    const projects = await findAllProjects(root);

    expect(relativePaths(projects)).toEqual([
      'packages/ui',
      'packages/ui/tools/generator',
      'web/app/themes/bedrock-theme',
      'wp-content/plugins/plugin-a',
      'wp-content/themes/mytheme',
    ]);
  });

  it('reports the relative path even when package.json names collide or are missing', async () => {
    const projects = await findAllProjects(root);

    const theme = projects.find(project => project.relativePath.includes('mytheme'));
    const plugin = projects.find(project => project.relativePath.includes('plugin-a'));

    // Name declared in package.json, which may be shared with other projects
    expect(theme?.name).toBe('build');
    // No name declared: falls back to the folder name
    expect(plugin?.name).toBe('plugin-a');
  });

  it('honours a shallower maxDepth', async () => {
    const projects = await findAllProjects(root, { maxDepth: 3 });

    expect(relativePaths(projects)).toEqual([
      'packages/ui',
      'wp-content/plugins/plugin-a',
      'wp-content/themes/mytheme',
    ]);
  });

  it('honours a custom exclude list', async () => {
    const projects = await findAllProjects(root, { exclude: ['node_modules', 'wp-content'] });

    expect(relativePaths(projects)).not.toContain('wp-content/themes/mytheme');
    expect(relativePaths(projects)).toContain('packages/ui');
  });

  it('defaults to a depth of five levels', () => {
    expect(DEFAULT_MAX_DEPTH).toBe(5);
  });
});

describe('findAllProjectsMultiRoot', () => {
  it('deduplicates projects discovered through more than one root', async () => {
    const projects = await findAllProjectsMultiRoot([root, root]);
    const paths = projects.map(project => project.path);

    expect(new Set(paths).size).toBe(paths.length);
  });
});
