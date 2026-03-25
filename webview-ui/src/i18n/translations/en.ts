export const en = {
  // Buttons
  buttons: {
    update: 'Update',
    updateAll: 'Update All',
    updateSelected: 'Update Selected',
    install: 'Install',
    uninstall: 'Uninstall',
    cancel: 'Cancel',
    rollback: 'Rollback',
    ignore: 'Ignore',
    unignore: 'Unignore',
    goBack: 'Go Back',
    retry: 'Retry',
    yesUninstall: 'Yes, Uninstall',
  },

  // Column headers
  columns: {
    package: 'Package',
    type: 'Type',
    installed: 'Installed',
    latest: 'Latest',
    size: 'Size',
    update: 'Update',
    lastUpdate: 'Last Update',
    action: 'Action',
  },

  // Dependency types
  dependencyTypes: {
    prod: 'Prod',
    dev: 'Dev',
    peer: 'Peer',
  },

  // Tooltips
  tooltips: {
    viewOnNpm: 'View on npm',
    deprecated: 'Deprecated',
    vulnerabilities: '{{count}} vulnerabilities found',
    noSecurityIssues: 'No security issues detected',
    viewChangelog: 'View changelog',
    uninstallPackage: 'Uninstall this package',
    ignorePackage: 'Ignore this package',
    unignorePackage: 'Unignore package',
    selectForUpdate: 'Select for update',
    noUpdateAvailable: 'No update available',
    selectAllUpdates: 'Select all packages with updates',
    refreshDependencies: 'Refresh dependencies (clears cache)',
    showOnlyUpdates: 'Show only packages with updates',
    showAllPackages: 'Show all packages',
    rollbackUpdate: 'Rollback last update ({{count}} package)',
    rollbackUpdate_plural: 'Rollback last update ({{count}} packages)',
  },

  // Placeholders
  placeholders: {
    filterPackages: 'Filter packages...',
    searchNpm: 'Search npm packages...',
  },

  // Loading and empty states
  states: {
    loading: 'Loading dependencies...',
    checking: 'checking...',
    checkingShort: '-',
    noDependencies: 'No dependencies found in package.json',
    allUpToDate: 'All packages are up to date! Click "Show All Packages" to see everything.',
    noMatchFilter: 'No packages match the current filter',
    searching: 'Searching...',
  },

  // Footer
  footer: {
    showing: 'Showing {{filtered}} of {{total}} packages',
    ignored: '({{count}} ignored)',
    updatesAvailable: '{{count}} update available',
    updatesAvailable_plural: '{{count}} updates available',
  },

  // Search panel
  search: {
    title: 'Install Packages',
    noResults: 'No packages found for "{{query}}"',
    weeklyDownloads: '{{downloads}}/wk',
    updated: 'Updated {{date}}',
    alreadyInstalled: '{{name}} is already installed',
    installAsDev: 'Install as dev dependency',
    confirmInstall: 'Install {{name}}@{{version}}?',
  },

  // Modal titles
  modals: {
    uninstallTitle: 'Uninstall Package',
    updateTitle: 'Update Package',
    updateAllTitle: 'Update All Packages',
    updateSelectedTitle: 'Update Selected Packages',
    ignoreTitle: 'Ignore Package',
    unignoreTitle: 'Unignore Package',
    rollbackTitle: 'Rollback Update',
  },

  // Modal messages
  modalMessages: {
    confirmUninstall: 'Are you sure you want to uninstall <strong>{{name}}</strong>?',
    confirmUpdate: 'Are you sure you want to update <strong>{{name}}</strong>?',
    confirmUpdateAll: 'Are you sure you want to update <strong>{{count}} package</strong>?',
    confirmUpdateAll_plural: 'Are you sure you want to update <strong>{{count}} packages</strong>?',
    confirmUpdateSelected: 'Are you sure you want to update <strong>{{count}} selected package</strong>?',
    confirmUpdateSelected_plural: 'Are you sure you want to update <strong>{{count}} selected packages</strong>?',
    confirmIgnore: 'Are you sure you want to ignore <strong>{{name}}</strong>?',
    confirmUnignore: 'Are you sure you want to unignore <strong>{{name}}</strong>?',
    confirmRollback: 'Rollback <strong>{{count}} package</strong> to previous versions?',
    confirmRollback_plural: 'Rollback <strong>{{count}} packages</strong> to previous versions?',
    rollbackDetails: 'The following packages will be restored to their previous versions:',
    ignoreHint: 'Ignored packages are excluded from update checks and counters.',
    andMore: '...and {{count}} more',
  },

  // Ignored section
  ignored: {
    title: 'Ignored ({{count}})',
  },

  // App header
  header: {
    showUpdatesOnly: 'Show Updates Only',
    showAllPackages: 'Show All Packages',
  },

  // Time ago
  timeAgo: {
    days: '{{count}} days ago',
    days_singular: '{{count}} day ago',
    months: '{{count}} months ago',
    months_singular: '{{count}} month ago',
    years: '{{count}} years ago',
    years_singular: '{{count}} year ago',
  },

  // Semver update types
  semver: {
    major: 'MAJOR',
    minor: 'MINOR',
    patch: 'PATCH',
  },
};

export type Translations = typeof en;
