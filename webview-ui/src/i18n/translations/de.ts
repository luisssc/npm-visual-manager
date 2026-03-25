import { Translations } from './en';

export const de: Translations = {
  // Buttons
  buttons: {
    update: 'Aktualisieren',
    updateAll: 'Alle aktualisieren',
    updateSelected: 'Ausgewählte aktualisieren',
    install: 'Installieren',
    uninstall: 'Deinstallieren',
    cancel: 'Abbrechen',
    rollback: 'Zurücksetzen',
    ignore: 'Ignorieren',
    unignore: 'Nicht ignorieren',
    goBack: 'Zurück',
    retry: 'Wiederholen',
    yesUninstall: 'Ja, deinstallieren',
  },

  // Column headers
  columns: {
    package: 'Paket',
    type: 'Typ',
    installed: 'Installiert',
    latest: 'Neueste',
    size: 'Größe',
    update: 'Aktualisierung',
    lastUpdate: 'Letzte Aktualisierung',
    action: 'Aktion',
  },

  // Dependency types
  dependencyTypes: {
    prod: 'Prod',
    dev: 'Dev',
    peer: 'Peer',
  },

  // Tooltips
  tooltips: {
    viewOnNpm: 'Auf npm anzeigen',
    deprecated: 'Veraltet',
    vulnerabilities: '{{count}} Schwachstellen gefunden',
    noSecurityIssues: 'Keine Sicherheitsprobleme erkannt',
    viewChangelog: 'Changelog anzeigen',
    uninstallPackage: 'Dieses Paket deinstallieren',
    ignorePackage: 'Dieses Paket ignorieren',
    unignorePackage: 'Paket nicht ignorieren',
    selectForUpdate: 'Zur Aktualisierung auswählen',
    noUpdateAvailable: 'Keine Aktualisierung verfügbar',
    selectAllUpdates: 'Alle Pakete mit Aktualisierungen auswählen',
    refreshDependencies: 'Abhängigkeiten aktualisieren (Cache löschen)',
    showOnlyUpdates: 'Nur Pakete mit Aktualisierungen anzeigen',
    showAllPackages: 'Alle Pakete anzeigen',
    rollbackUpdate: 'Letzte Aktualisierung zurücksetzen ({{count}} Paket)',
    rollbackUpdate_plural: 'Letzte Aktualisierung zurücksetzen ({{count}} Pakete)',
  },

  // Placeholders
  placeholders: {
    filterPackages: 'Pakete filtern...',
    searchNpm: 'npm-Pakete suchen...',
  },

  // Loading and empty states
  states: {
    loading: 'Abhängigkeiten werden geladen...',
    checking: 'wird geprüft...',
    checkingShort: '-',
    noDependencies: 'Keine Abhängigkeiten in package.json gefunden',
    allUpToDate: 'Alle Pakete sind auf dem neuesten Stand! Klicken Sie auf "Alle anzeigen", um alles zu sehen.',
    noMatchFilter: 'Keine Pakete entsprechen dem aktuellen Filter',
    searching: 'Wird gesucht...',
  },

  // Footer
  footer: {
    showing: '{{filtered}} von {{total}} Paketen werden angezeigt',
    ignored: '({{count}} ignoriert)',
    updatesAvailable: '{{count}} Aktualisierung verfügbar',
    updatesAvailable_plural: '{{count}} Aktualisierungen verfügbar',
  },

  // Search panel
  search: {
    title: 'Pakete installieren',
    noResults: 'Keine Pakete für "{{query}}" gefunden',
    weeklyDownloads: '{{downloads}}/Wo',
    updated: 'Aktualisiert {{date}}',
    alreadyInstalled: '{{name}} ist bereits installiert',
    installAsDev: 'Als Entwicklungsabhängigkeit installieren',
    confirmInstall: '{{name}}@{{version}} installieren?',
  },

  // Modal titles
  modals: {
    uninstallTitle: 'Paket deinstallieren',
    updateTitle: 'Paket aktualisieren',
    updateAllTitle: 'Alle Pakete aktualisieren',
    updateSelectedTitle: 'Ausgewählte Pakete aktualisieren',
    ignoreTitle: 'Paket ignorieren',
    unignoreTitle: 'Paket nicht ignorieren',
    rollbackTitle: 'Aktualisierung zurücksetzen',
  },

  // Modal messages
  modalMessages: {
    confirmUninstall: 'Sind Sie sicher, dass Sie <strong>{{name}}</strong> deinstallieren möchten?',
    confirmUpdate: 'Sind Sie sicher, dass Sie <strong>{{name}}</strong> aktualisieren möchten?',
    confirmUpdateAll: 'Sind Sie sicher, dass Sie <strong>{{count}} Paket</strong> aktualisieren möchten?',
    confirmUpdateAll_plural: 'Sind Sie sicher, dass Sie <strong>{{count}} Pakete</strong> aktualisieren möchten?',
    confirmUpdateSelected:
      'Sind Sie sicher, dass Sie <strong>{{count}} ausgewähltes Paket</strong> aktualisieren möchten?',
    confirmUpdateSelected_plural:
      'Sind Sie sicher, dass Sie <strong>{{count}} ausgewählte Pakete</strong> aktualisieren möchten?',
    confirmIgnore: 'Sind Sie sicher, dass Sie <strong>{{name}}</strong> ignorieren möchten?',
    confirmUnignore: 'Sind Sie sicher, dass Sie <strong>{{name}}</strong> nicht mehr ignorieren möchten?',
    confirmRollback: '<strong>{{count}} Paket</strong> auf vorherige Version zurücksetzen?',
    confirmRollback_plural: '<strong>{{count}} Pakete</strong> auf vorherige Versionen zurücksetzen?',
    rollbackDetails: 'Die folgenden Pakete werden auf ihre vorherigen Versionen zurückgesetzt:',
    ignoreHint: 'Ignorierte Pakete werden von Aktualisierungsprüfungen und Zählern ausgeschlossen.',
    andMore: '...und {{count}} weitere',
  },

  // Ignored section
  ignored: {
    title: 'Ignoriert ({{count}})',
  },

  // App header
  header: {
    showUpdatesOnly: 'Nur Aktualisierungen',
    showAllPackages: 'Alle anzeigen',
  },

  // Time ago
  timeAgo: {
    days: 'vor {{count}} Tagen',
    days_singular: 'vor {{count}} Tag',
    months: 'vor {{count}} Monaten',
    months_singular: 'vor {{count}} Monat',
    years: 'vor {{count}} Jahren',
    years_singular: 'vor {{count}} Jahr',
  },

  // Semver update types
  semver: {
    major: 'MAJOR',
    minor: 'MINOR',
    patch: 'PATCH',
  },
};
