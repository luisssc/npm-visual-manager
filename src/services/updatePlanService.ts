import { minVersion, parse, validRange } from 'semver';
import type { Dependency, PackageManager, SemverUpdateType } from '../../types';
import { getInstallCommand, getPackageManagerInfo } from './packageManagerService';

export interface UpdatePlanOptions {
  dependencies: Dependency[];
  packageManager: PackageManager;
  /** Workspace-relative package.json the updates apply to (e.g. "apps/web/package.json") */
  targetFile: string;
  /** Script names declared in that package.json */
  scripts: string[];
  saveExact?: boolean;
}

interface UpdateGroup {
  title: string;
  guidance: string;
  types: (SemverUpdateType | undefined)[];
}

// Lowest risk first: the plan tells the assistant to work top to bottom
const GROUPS: UpdateGroup[] = [
  {
    title: 'Patch updates (low risk)',
    guidance: 'Bug fixes only. Update them together, then run the verification commands.',
    types: ['patch'],
  },
  {
    title: 'Minor updates (medium risk)',
    guidance:
      'New features that should be backward compatible. Update them together, run the verification commands, and if anything fails, bisect by updating one package at a time.',
    types: ['minor'],
  },
  {
    title: 'Pre-release to stable (low to medium risk)',
    guidance: 'Promotions from a pre-release to its stable version. Update them one at a time.',
    types: ['release'],
  },
  {
    title: 'Major updates (high risk, may contain breaking changes)',
    guidance:
      'Update ONE package at a time, or one set of packages marked to be updated together. Before each one, read its release notes or migration guide, search the codebase for the APIs it changed, adapt the code, and run the verification commands before moving on to the next.',
    types: ['major'],
  },
  {
    title: 'Pre-release updates (unstable)',
    guidance: 'These target pre-release versions. Ask me before applying them.',
    types: ['prerelease'],
  },
  {
    title: 'Other updates',
    guidance: 'The update type could not be determined. Treat them as major updates.',
    types: ['unknown', 'none', undefined],
  },
];

// Scripts worth running after each step, in the order they are suggested
const VERIFICATION_SCRIPTS = ['typecheck', 'type-check', 'lint', 'test', 'build'];

const DEPENDENCY_TYPE_LABELS: Record<Dependency['type'], string> = {
  dependencies: 'prod',
  devDependencies: 'dev',
  peerDependencies: 'peer',
};

const escapeCell = (value: string): string =>
  value
    .replace(/\|/g, '\\|')
    .replace(/\s*\r?\n\s*/g, ' ')
    .trim();

/**
 * Release notes link, only for public GitHub repositories. Other hosts may be
 * internal (private registries, self-hosted GitLab) and must not end up in a
 * prompt pasted into an external AI service.
 */
const getReleaseNotesUrl = (repositoryUrl: string | undefined): string | undefined => {
  if (!repositoryUrl) {
    return undefined;
  }
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(repositoryUrl.trim());
  return match ? `https://github.com/${match[1]}/${match[2]}/releases` : undefined;
};

interface PlannedUpdate {
  dep: Dependency;
  type: SemverUpdateType | undefined;
  /** Why the plan places the update in a riskier group than the table badge */
  riskNote?: string;
}

/**
 * The table badge compares version numbers only. The plan also accounts for
 * pre-release targets (a "latest" tag can point to one) and for 0.x versions,
 * where npm treats a minor (or, in 0.0.x, a patch) bump as breaking.
 */
const planUpdate = (dep: Dependency): PlannedUpdate => {
  const type = dep.semverUpdateType;
  const target = parse(dep.latestVersion);
  if (target && target.prerelease.length > 0) {
    return { dep, type: 'prerelease', riskNote: 'Target is a pre-release version' };
  }
  if (type !== 'minor' && type !== 'patch') {
    return { dep, type };
  }
  const current =
    parse(dep.installedVersion) ?? (validRange(dep.declaredVersion) ? minVersion(dep.declaredVersion) : null);
  if (current && current.major === 0 && (type === 'minor' || current.minor === 0)) {
    return {
      dep,
      type: 'major',
      riskNote: `Treated as major: in 0.x versions a ${type} update may contain breaking changes`,
    };
  }
  return { dep, type };
};

const getRepositoryKey = (repositoryUrl: string | undefined): string | undefined =>
  repositoryUrl
    ?.trim()
    .toLowerCase()
    .replace(/(\.git)?\/?$/, '') || undefined;

const getNotes = (update: PlannedUpdate, siblings: string[]): string => {
  const { dep, riskNote } = update;
  const notes: string[] = [];
  if (riskNote) {
    notes.push(riskNote);
  }
  if (siblings.length > 0) {
    notes.push(`Update together with ${siblings.map(name => `\`${name}\``).join(', ')} (same repository)`);
  }
  const releaseNotes = getReleaseNotesUrl(dep.repositoryUrl);
  if (releaseNotes) {
    notes.push(`[Release notes](${releaseNotes})`);
  }
  if (dep.isDeprecated) {
    notes.push(
      dep.deprecationMessage ? `Current version deprecated: ${dep.deprecationMessage}` : 'Current version deprecated'
    );
  }
  if (dep.vulnerabilityCount) {
    const ids = (dep.vulnerabilities ?? []).map(v => `${v.id} (${v.severity})`).join(', ');
    notes.push(
      `${dep.vulnerabilityCount} known vulnerabilit${dep.vulnerabilityCount === 1 ? 'y' : 'ies'}${ids ? `: ${ids}` : ''}`
    );
  }
  return escapeCell(notes.join('; ')) || '—';
};

const getCommand = (dep: Dependency, packageManager: PackageManager, saveExact: boolean): string => {
  // Add commands would move a peer dependency into "dependencies"
  if (dep.type === 'peerDependencies') {
    return 'Edit the `peerDependencies` range in package.json';
  }
  const command = getInstallCommand(packageManager, dep.name, dep.latestVersion, saveExact);
  // Without the dev flag some managers move the package into "dependencies"
  if (dep.type === 'devDependencies') {
    const { addCommand, devFlag } = getPackageManagerInfo(packageManager);
    return `\`${command.replace(addCommand, `${addCommand} ${devFlag}`)}\``;
  }
  return `\`${command}\``;
};

/**
 * Builds a Markdown prompt asking an AI coding assistant to apply the given
 * updates safely. Only package names, versions and public links are included.
 */
export function buildUpdatePlan(options: UpdatePlanOptions): string {
  const { dependencies, packageManager, targetFile, scripts, saveExact = false } = options;
  const info = getPackageManagerInfo(packageManager);
  const updates = dependencies.filter(d => d.updateAvailable && d.latestVersion && !d.isIgnored).map(planUpdate);

  // Packages released from the same repository usually need matching versions
  // (react/react-dom, eslint/@eslint/js), so they are flagged to move together
  const byRepository = new Map<string, string[]>();
  for (const { dep } of updates) {
    const key = getRepositoryKey(dep.repositoryUrl);
    if (key) {
      byRepository.set(key, [...(byRepository.get(key) ?? []), dep.name]);
    }
  }
  const getSiblings = (dep: Dependency): string[] => {
    const key = getRepositoryKey(dep.repositoryUrl);
    return key ? (byRepository.get(key) ?? []).filter(name => name !== dep.name).sort() : [];
  };

  const verification = VERIFICATION_SCRIPTS.filter(s => scripts.includes(s)).map(s => `\`${info.runCommand} ${s}\``);

  const lines: string[] = [
    '# Dependency update plan',
    '',
    `Update the following ${updates.length === 1 ? 'dependency' : `${updates.length} dependencies`} in \`${targetFile}\` without breaking the existing code. The project uses **${packageManager}**.`,
    '',
    '## Rules',
    '',
    `- Use ${packageManager} for every change and keep its lockfile in sync. Do not switch package managers or edit the lockfile by hand.`,
    '- Work through the groups below in order, from lowest to highest risk.',
    verification.length > 0
      ? `- After each step, run ${verification.join(', ')} and fix any failure before continuing.`
      : '- This package.json declares no test, lint or build scripts. After each step, tell me how you verified that nothing broke.',
    '- Do not update packages that are not listed here, and do not change version ranges of other dependencies.',
    '- If an update cannot be completed safely, revert it, explain why, and continue with the rest.',
    '- When you finish, summarize what was updated, what code changed, and anything that still needs my attention.',
  ];

  for (const group of GROUPS) {
    const planned = updates
      .filter(u => group.types.includes(u.type))
      .sort((a, b) => a.dep.name.localeCompare(b.dep.name));
    if (planned.length === 0) {
      continue;
    }
    lines.push(
      '',
      `## ${group.title}`,
      '',
      group.guidance,
      '',
      '| Package | Type | Declared | Installed | Target | Command | Notes |',
      '| --- | --- | --- | --- | --- | --- | --- |'
    );
    for (const update of planned) {
      const { dep } = update;
      lines.push(
        `| \`${dep.name}\` | ${DEPENDENCY_TYPE_LABELS[dep.type]} | \`${escapeCell(dep.declaredVersion)}\` | ${escapeCell(dep.installedVersion) || '—'} | \`${dep.latestVersion}\` | ${getCommand(dep, packageManager, saveExact)} | ${getNotes(update, getSiblings(dep))} |`
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}
