/**
 * When the user last changed each direct dependency.
 * The git history of the committed package.json is read once per HEAD. Updates
 * made in this extension are stored separately so they show up before the next commit.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { validRange } from 'semver';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const STORE_FILENAME = 'user-package-updates.json';

type Store = Record<string, Record<string, string>>;

let storageDir: string | null = null;
let loadedFor: string | null = null;
let store: Store = {};
const historyCache =new Map<string, { head: string; updates: Map<string, string> }>();

export function setUserUpdateStorageDir(dir: string): void {
  storageDir = dir;
}

/**
 * Reads `git log -p` of package.json, newest commit first, and returns the
 * author date of the last commit that changed each dependency's version.
 * Lines whose version did not change (a trailing comma, re-indentation, a move
 * between sections) are ignored, so reformatting does not reset the dates.
 */
export function parseDependencyHistory(logOutput: string): Map<string, string> {
  const updates = new Map<string, string>();

  for (const commit of logOutput.split('\0')) {
    const lines = commit.trimStart().split('\n');
    const date = lines[0]?.trim();
    if (!date) {continue;}

    const removed = new Map<string, string>();
    const added = new Map<string, string>();
    for (const line of lines.slice(1)) {
      if (line.startsWith('---') || line.startsWith('+++')) {continue;}
      const sign = line[0];
      if (sign !== '+' && sign !== '-') {continue;}
      const entry = /^\s*"([^"]+)"\s*:\s*"([^"]*)"/.exec(line.slice(1));
      if (!entry?.[1] || entry[2] === undefined || !isVersionSpec(entry[2])) {continue;}
      (sign === '+' ? added : removed).set(entry[1], entry[2]);
    }

    for (const [name, version] of added) {
      if (!updates.has(name) && removed.get(name) !== version) {updates.set(name, date);}
    }
  }

  return updates;
}

export function mergeUpdateTimes(fromGit: Map<string, string>, fromTool: Map<string, string>): Map<string, string> {
  const merged = new Map(fromGit);
  for (const [name, iso] of fromTool) {
    const previous = merged.get(name);
    if (!previous || iso > previous) {merged.set(name, iso);}
  }
  return merged;
}

export function recordUserPackageUpdates(
  projectPath: string,
  packageNames: string[],
  at: string = new Date().toISOString()
): void {
  if (packageNames.length === 0) {return;}
  ensureLoaded();
  const key = path.resolve(projectPath);
  const entry = { ...(store[key] ?? {}) };
  for (const name of packageNames) {entry[name] = at;}
  store[key] = entry;
  persist();
}

export function forgetUserPackageUpdate(projectPath: string, packageName: string): void {
  ensureLoaded();
  const key = path.resolve(projectPath);
  const entry = store[key];
  if (!entry || !(packageName in entry)) {return;}
  delete entry[packageName];
  persist();
}

export async function getUserPackageUpdates(projectPath: string): Promise<Map<string, string>> {
  const [fromGit, fromTool] = await Promise.all([
    readGitDependencyUpdates(projectPath),
    Promise.resolve(readRecordedUpdates(projectPath)),
  ]);
  return mergeUpdateTimes(fromGit, fromTool);
}

function readRecordedUpdates(projectPath: string): Map<string, string> {
  ensureLoaded();
  const entry = store[path.resolve(projectPath)] ?? {};
  return new Map(Object.entries(entry));
}

async function readGitDependencyUpdates(projectPath: string): Promise<Map<string, string>> {
  let head: string;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: projectPath,
      timeout: 3000,
      encoding: 'utf8',
    });
    head = String(stdout).trim();
  } catch {
    return new Map();
  }

  const cached = historyCache.get(projectPath);
  if (cached?.head === head) {return cached.updates;}

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-p', '-U0', '--no-color', '--no-ext-diff', '--format=%x00%aI', 'HEAD', '--', 'package.json'],
      {
        cwd: projectPath,
        timeout: 8000,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
      }
    );
    const updates = parseDependencyHistory(String(stdout));
    historyCache.set(projectPath, { head, updates });
    return updates;
  } catch {
    const updates = new Map<string, string>();
    historyCache.set(projectPath, { head, updates });
    return updates;
  }
}

function ensureLoaded(): void {
  const key = storageDir ?? '';
  if (loadedFor === key) {return;}
  loadedFor = key;
  store = {};
  if (!storageDir) {return;}
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(storageDir, STORE_FILENAME), 'utf8')) as Store;
    if (parsed && typeof parsed === 'object') {store = parsed;}
  } catch {
    store = {};
  }
}

function persist(): void {
  if (!storageDir) {return;}
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, STORE_FILENAME), JSON.stringify(store));
}

/** Skips scripts and other string fields that share a dependency's name. */
function isVersionSpec(value: string): boolean {
  return validRange(value) !== null || /^(npm|workspace|file|link|git|git\+[a-z]+|github|https?):/.test(value);
}
