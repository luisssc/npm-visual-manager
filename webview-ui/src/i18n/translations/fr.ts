import { Translations } from './en';

export const fr: Translations = {
  // Buttons
  buttons: {
    update: 'Mettre à jour',
    updateAll: 'Tout mettre à jour',
    updateSelected: 'Mettre à jour la sélection',
    install: 'Installer',
    uninstall: 'Désinstaller',
    cancel: 'Annuler',
    rollback: 'Annuler',
    ignore: 'Ignorer',
    unignore: 'Ne plus ignorer',
    goBack: 'Retour',
    retry: 'Réessayer',
    yesUninstall: 'Oui, désinstaller',
  },

  // Column headers
  columns: {
    package: 'Paquet',
    type: 'Type',
    installed: 'Installé',
    latest: 'Dernier',
    size: 'Taille',
    update: 'Mise à jour',
    lastUpdate: 'Dernière mise à jour',
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
    viewOnNpm: 'Voir sur npm',
    deprecated: 'Obsolète',
    vulnerabilities: '{{count}} vulnérabilités trouvées',
    noSecurityIssues: 'Aucun problème de sécurité détecté',
    viewChangelog: 'Voir le changelog',
    uninstallPackage: 'Désinstaller ce paquet',
    ignorePackage: 'Ignorer ce paquet',
    unignorePackage: 'Ne plus ignorer le paquet',
    selectForUpdate: 'Sélectionner pour mise à jour',
    noUpdateAvailable: 'Aucune mise à jour disponible',
    selectAllUpdates: 'Sélectionner tous les paquets avec mises à jour',
    refreshDependencies: 'Actualiser les dépendances (vider le cache)',
    showOnlyUpdates: 'Afficher uniquement les paquets avec mises à jour',
    showAllPackages: 'Afficher tous les paquets',
    rollbackUpdate: 'Annuler la dernière mise à jour ({{count}} paquet)',
    rollbackUpdate_plural: 'Annuler la dernière mise à jour ({{count}} paquets)',
  },

  // Placeholders
  placeholders: {
    filterPackages: 'Filtrer les paquets...',
    searchNpm: 'Rechercher des paquets npm...',
  },

  // Loading and empty states
  states: {
    loading: 'Chargement des dépendances...',
    checking: 'vérification...',
    checkingShort: '-',
    noDependencies: 'Aucune dépendance trouvée dans package.json',
    allUpToDate: 'Tous les paquets sont à jour ! Cliquez sur "Afficher tout" pour tout voir.',
    noMatchFilter: 'Aucun paquet ne correspond au filtre actuel',
    searching: 'Recherche...',
  },

  // Footer
  footer: {
    showing: 'Affichage de {{filtered}} sur {{total}} paquets',
    ignored: '({{count}} ignoré(s))',
    updatesAvailable: '{{count}} mise à jour disponible',
    updatesAvailable_plural: '{{count}} mises à jour disponibles',
  },

  // Search panel
  search: {
    title: 'Installer des paquets',
    noResults: 'Aucun paquet trouvé pour "{{query}}"',
    weeklyDownloads: '{{downloads}}/sem',
    updated: 'Mis à jour {{date}}',
    alreadyInstalled: '{{name}} est déjà installé',
    installAsDev: 'Installer comme dépendance de développement',
    confirmInstall: 'Installer {{name}}@{{version}} ?',
  },

  // Modal titles
  modals: {
    uninstallTitle: 'Désinstaller le paquet',
    updateTitle: 'Mettre à jour le paquet',
    updateAllTitle: 'Mettre à jour tous les paquets',
    updateSelectedTitle: 'Mettre à jour les paquets sélectionnés',
    ignoreTitle: 'Ignorer le paquet',
    unignoreTitle: 'Ne plus ignorer le paquet',
    rollbackTitle: 'Annuler la Mise à jour',
  },

  // Modal messages
  modalMessages: {
    confirmUninstall: 'Êtes-vous sûr de vouloir désinstaller <strong>{{name}}</strong> ?',
    confirmUpdate: 'Êtes-vous sûr de vouloir mettre à jour <strong>{{name}}</strong> ?',
    confirmUpdateAll: 'Êtes-vous sûr de vouloir mettre à jour <strong>{{count}} paquet</strong> ?',
    confirmUpdateAll_plural: 'Êtes-vous sûr de vouloir mettre à jour <strong>{{count}} paquets</strong> ?',
    confirmUpdateSelected: 'Êtes-vous sûr de vouloir mettre à jour <strong>{{count}} paquet sélectionné</strong> ?',
    confirmUpdateSelected_plural:
      'Êtes-vous sûr de vouloir mettre à jour <strong>{{count}} paquets sélectionnés</strong> ?',
    confirmIgnore: 'Êtes-vous sûr de vouloir ignorer <strong>{{name}}</strong> ?',
    confirmUnignore: 'Êtes-vous sûr de vouloir ne plus ignorer <strong>{{name}}</strong> ?',
    confirmRollback: 'Annuler la mise à jour de <strong>{{count}} paquet</strong> ?',
    confirmRollback_plural: 'Annuler la mise à jour de <strong>{{count}} paquets</strong> ?',
    rollbackDetails: 'Les paquets suivants seront restaurés à leurs versions précédentes :',
    ignoreHint: 'Les paquets ignorés sont exclus des vérifications de mise à jour et des compteurs.',
    andMore: '...et {{count}} de plus',
  },

  // Ignored section
  ignored: {
    title: 'Ignorés ({{count}})',
  },

  // App header
  header: {
    showUpdatesOnly: 'Uniquement les mises à jour',
    showAllPackages: 'Afficher tout',
  },

  // Time ago
  timeAgo: {
    days: 'il y a {{count}} jours',
    days_singular: 'il y a {{count}} jour',
    months: 'il y a {{count}} mois',
    months_singular: 'il y a {{count}} mois',
    years: 'il y a {{count}} ans',
    years_singular: 'il y a {{count}} an',
  },

  // Semver update types
  semver: {
    major: 'MAJOR',
    minor: 'MINOR',
    patch: 'PATCH',
  },
};
