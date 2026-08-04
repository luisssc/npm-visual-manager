/**
 * Guards that runtime assets referenced from the source actually ship in the
 * .vsix.
 *
 * This failed silently for three releases: `.vscodeignore` excluded
 * `resources/*.svg` while `webviewPanel.ts` set the editor tab icon from
 * `resources/icon-light.svg` and `icon-dark.svg`. Everything worked when
 * running from source (F5) and the icon was simply missing once installed from
 * the Marketplace, with no error anywhere. Nothing but installing the packaged
 * extension would reveal it, which is exactly why it needs a test.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

interface IgnoreRule {
  pattern: string;
  negated: boolean;
}

function readIgnoreRules(): IgnoreRule[] {
  const content = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf-8');

  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line =>
      line.startsWith('!') ? { pattern: line.slice(1), negated: true } : { pattern: line, negated: false }
    );
}

/**
 * Translate a .vscodeignore glob to a regex. A deliberately small subset of
 * glob semantics — enough for the patterns this project uses (`**` across
 * directories, `*` within a segment) rather than a full implementation.
 */
function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` spans any number of directories, including none
        if (pattern[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }
    source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }

  return new RegExp(`^${source}$`);
}

/** Whether a repo-relative path survives .vscodeignore. Last rule wins. */
function isPackaged(relativePath: string, rules: IgnoreRule[]): boolean {
  let excluded = false;

  for (const rule of rules) {
    const matcher = globToRegExp(rule.pattern);
    // A pattern without a slash matches at any depth, as in .gitignore
    const matches =
      matcher.test(relativePath) || (!rule.pattern.includes('/') && matcher.test(path.basename(relativePath)));

    if (matches) {
      excluded = !rule.negated;
    }
  }

  return !excluded;
}

/** Every `resources/<file>` the extension host loads at runtime. */
function referencedResources(): string[] {
  const found = new Set<string>();

  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') {
          walk(fullPath);
        }
        continue;
      }
      if (!entry.name.endsWith('.ts')) {
        continue;
      }
      const contents = fs.readFileSync(fullPath, 'utf-8');
      for (const match of contents.matchAll(/'resources',\s*'([^']+)'/g)) {
        found.add(`resources/${match[1]!}`);
      }
    }
  };

  walk(path.join(ROOT, 'src'));
  return [...found].sort();
}

const rules = readIgnoreRules();
const resources = referencedResources();

describe('packaged runtime assets', () => {
  it('finds the resources the source loads', () => {
    // A rename that this regex stops matching would make the checks below pass
    // vacuously, so assert the extraction still finds something.
    expect(resources).toContain('resources/icon-light.svg');
    expect(resources).toContain('resources/icon-dark.svg');
  });

  it.each(resources)('%s exists on disk', resource => {
    expect(fs.existsSync(path.join(ROOT, resource))).toBe(true);
  });

  it.each(resources)('%s is not excluded by .vscodeignore', resource => {
    expect(isPackaged(resource, rules)).toBe(true);
  });

  it('still excludes source and unreferenced assets from the package', () => {
    // Sanity check on the matcher itself: if it reported everything as packaged
    // the assertions above would be meaningless.
    expect(isPackaged('src/core/extension.ts', rules)).toBe(false);
    expect(isPackaged('resources/icon-theme-aware.svg', rules)).toBe(false);
    expect(isPackaged('out/core/extension.js', rules)).toBe(true);
    expect(isPackaged('resources/icon-marketplace.png', rules)).toBe(true);
  });
});
