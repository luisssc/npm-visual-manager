/**
 * When the user last changed each direct dependency.
 * Git blame of the committed package.json runs once per HEAD. Updates made
 * in this extension are stored separately so they show up before the next commit.
 * ponytail: blame is cached until HEAD moves. A rewritten commit that keeps the
 * same HEAD hash keeps the previous dates until the next commit.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const STORE_FILENAME = 'user-package-updates.json';
const DEPENDENCY_SECTIONS = new Set(['dependencies', 'devDependencies', 'peerDependencies']);

type Store = Record<string, Record<string, string>>;

let storageDir: string | null = null;
let loadedFor: string | null = null;
let store: Store = {};
const blameCache = new Map<string, { head: string; updates: Map<string, string> }>();

export function setUserUpdateStorageDir(dir: string): void {
  storageDir = dir;
}

export function parseBlameForDependencies(blameOutput: string): Map<string, string> {
  const updates = new Map<string, string>();
  const timeByHash = new Map<string, string>();
  let currentHash = '';
  let currentTime: string | null = null;
  let inSection = false;
  let depth = 0;

  for (const line of blameOutput.split('\n')) {
    const header = /^([0-9a-f]{40}) /.exec(line);
    if (header?.[1]) {
      currentHash = header[1];
      currentTime = /^0+$/.test(currentHash) ? null : (timeByHash.get(currentHash) ?? null);
      continue;
    }

    if (line.startsWith('author-time ')) {
      const unix = Number(line.slice('author-time '.length));
      if (!/^0+$/.test(currentHash) && Number.isFinite(unix) && unix > 0) {
        currentTime = new Date(unix * 1000).toISOString();
        timeByHash.set(currentHash, currentTime);
      } else {
        currentTime = null;
      }
      continue;
    }

    if (!line.startsWith('\t')) {continue;}

    const trimmed = line.slice(1).trim();
    const section = /^"([^"]+)"\s*:\s*\{(.*)$/.exec(trimmed);
    if (!inSection && section?.[1] && DEPENDENCY_SECTIONS.has(section[1])) {
      inSection = true;
      depth = 1 + countChar(section[2] ?? '', '{') - countChar(section[2] ?? '', '}');
      if (depth <= 0) {
        inSection = false;
        depth = 0;
      }
      continue;
    }
    if (!inSection) {continue;}

    if (depth === 1 && currentTime) {
      const entry = /^"([^"]+)"\s*:\s*"/.exec(trimmed);
      if (entry?.[1]) {updates.set(entry[1], currentTime);}
    }
    depth += countChar(trimmed, '{') - countChar(trimmed, '}');
    if (depth <= 0) {
      inSection = false;
      depth = 0;
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

  const cached = blameCache.get(projectPath);
  if (cached?.head === head) {return cached.updates;}

  try {
    const { stdout } = await execFileAsync('git', ['blame', '-p', 'HEAD', '--', 'package.json'], {
      cwd: projectPath,
      timeout: 8000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8',
    });
    const updates = parseBlameForDependencies(String(stdout));
    blameCache.set(projectPath, { head, updates });
    return updates;
  } catch {
    const updates = new Map<string, string>();
    blameCache.set(projectPath, { head, updates });
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

function countChar(value: string, char: string): number {
  let count = 0;
  for (const item of value) {
    if (item === char) {count += 1;}
  }
  return count;
}
