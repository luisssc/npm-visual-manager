import { Translations } from './en';

export const ru: Translations = {
  // Buttons
  buttons: {
    update: 'Обновить',
    updateAll: 'Обновить все',
    updateSelected: 'Обновить выбранные',
    install: 'Установить',
    uninstall: 'Удалить',
    cancel: 'Отмена',
    rollback: 'Откат',
    ignore: 'Игнорировать',
    unignore: 'Не игнорировать',
    goBack: 'Назад',
    retry: 'Повторить',
    yesUninstall: 'Да, удалить',
  },

  // Column headers
  columns: {
    package: 'Пакет',
    type: 'Тип',
    installed: 'Установлено',
    latest: 'Последняя',
    size: 'Размер',
    update: 'Обновление',
    lastUpdate: 'Последнее обновление',
    action: 'Действие',
  },

  // Dependency types
  dependencyTypes: {
    prod: 'Prod',
    dev: 'Dev',
    peer: 'Peer',
  },

  // Tooltips
  tooltips: {
    viewOnNpm: 'Посмотреть на npm',
    deprecated: 'Устарело',
    vulnerabilities: 'Найдено уязвимостей: {{count}}',
    noSecurityIssues: 'Проблем безопасности не обнаружено',
    viewChangelog: 'Посмотреть журнал изменений',
    uninstallPackage: 'Удалить этот пакет',
    ignorePackage: 'Игнорировать этот пакет',
    unignorePackage: 'Не игнорировать пакет',
    selectForUpdate: 'Выбрать для обновления',
    noUpdateAvailable: 'Нет доступных обновлений',
    selectAllUpdates: 'Выбрать все пакеты с обновлениями',
    refreshDependencies: 'Обновить зависимости (очистить кэш)',
    showOnlyUpdates: 'Показать только пакеты с обновлениями',
    showAllPackages: 'Показать все пакеты',
    rollbackUpdate: 'Откатить последнее обновление ({{count}} пакет)',
    rollbackUpdate_plural: 'Откатить последнее обновление ({{count}} пакетов)',
  },

  // Placeholders
  placeholders: {
    filterPackages: 'Фильтровать пакеты...',
    searchNpm: 'Искать пакеты npm...',
  },

  // Loading and empty states
  states: {
    loading: 'Загрузка зависимостей...',
    checking: 'проверка...',
    checkingShort: '-',
    noDependencies: 'В package.json не найдено зависимостей',
    allUpToDate: 'Все пакеты обновлены! Нажмите "Показать все", чтобы увидеть всё.',
    noMatchFilter: 'Нет пакетов, соответствующих текущему фильтру',
    searching: 'Поиск...',
  },

  // Footer
  footer: {
    showing: 'Показано {{filtered}} из {{total}} пакетов',
    ignored: '({{count}} игнор.)',
    updatesAvailable: 'Доступно {{count}} обновление',
    updatesAvailable_plural: 'Доступно {{count}} обновлений',
  },

  // Search panel
  search: {
    title: 'Установить пакеты',
    noResults: 'Пакеты для "{{query}}" не найдены',
    weeklyDownloads: '{{downloads}}/нед',
    updated: 'Обновлено {{date}}',
    alreadyInstalled: '{{name}} уже установлен',
    installAsDev: 'Установить как зависимость разработки',
    confirmInstall: 'Установить {{name}}@{{version}}?',
  },

  // Modal titles
  modals: {
    uninstallTitle: 'Удалить пакет',
    updateTitle: 'Обновить пакет',
    updateAllTitle: 'Обновить все пакеты',
    updateSelectedTitle: 'Обновить выбранные пакеты',
    ignoreTitle: 'Игнорировать пакет',
    unignoreTitle: 'Не игнорировать пакет',
    rollbackTitle: 'Откат Обновления',
  },

  // Modal messages
  modalMessages: {
    confirmUninstall: 'Вы уверены, что хотите удалить <strong>{{name}}</strong>?',
    confirmUpdate: 'Вы уверены, что хотите обновить <strong>{{name}}</strong>?',
    confirmUpdateAll: 'Вы уверены, что хотите обновить <strong>{{count}} пакет</strong>?',
    confirmUpdateAll_plural: 'Вы уверены, что хотите обновить <strong>{{count}} пакетов</strong>?',
    confirmUpdateSelected: 'Вы уверены, что хотите обновить <strong>{{count}} выбранный пакет</strong>?',
    confirmUpdateSelected_plural: 'Вы уверены, что хотите обновить <strong>{{count}} выбранных пакетов</strong>?',
    confirmIgnore: 'Вы уверены, что хотите игнорировать <strong>{{name}}</strong>?',
    confirmUnignore: 'Вы уверены, что хотите не игнорировать <strong>{{name}}</strong>?',
    confirmRollback: 'Откатить <strong>{{count}} пакет</strong> к предыдущим версиям?',
    confirmRollback_plural: 'Откатить <strong>{{count}} пакетов</strong> к предыдущим версиям?',
    rollbackDetails: 'Следующие пакеты будут восстановлены до предыдущих версий:',
    ignoreHint: 'Игнорируемые пакеты исключаются из проверок обновлений и счетчиков.',
    andMore: '...и ещё {{count}}',
  },

  // Ignored section
  ignored: {
    title: 'Игнорируется ({{count}})',
  },

  // App header
  header: {
    showUpdatesOnly: 'Только обновления',
    showAllPackages: 'Показать все',
  },

  // Time ago
  timeAgo: {
    days: '{{count}} дней назад',
    days_singular: '{{count}} день назад',
    months: '{{count}} месяцев назад',
    months_singular: '{{count}} месяц назад',
    years: '{{count}} лет назад',
    years_singular: '{{count}} год назад',
  },

  // Semver update types
  semver: {
    major: 'MAJOR',
    minor: 'MINOR',
    patch: 'PATCH',
  },
};
