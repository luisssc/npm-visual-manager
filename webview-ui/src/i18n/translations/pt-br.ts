import { Translations } from './en';

export const ptBr: Translations = {
  // Buttons
  buttons: {
    update: 'Atualizar',
    updateAll: 'Atualizar Todos',
    updateSelected: 'Atualizar Selecionados',
    install: 'Instalar',
    uninstall: 'Desinstalar',
    cancel: 'Cancelar',
    rollback: 'Reverter',
    ignore: 'Ignorar',
    unignore: 'Não Ignorar',
    goBack: 'Voltar',
    retry: 'Tentar Novamente',
    yesUninstall: 'Sim, Desinstalar',
  },

  // Column headers
  columns: {
    package: 'Pacote',
    type: 'Tipo',
    installed: 'Instalado',
    latest: 'Mais Recente',
    size: 'Tamanho',
    update: 'Atualização',
    lastUpdate: 'Última Atualização',
    action: 'Ação',
  },

  // Dependency types
  dependencyTypes: {
    prod: 'Prod',
    dev: 'Dev',
    peer: 'Peer',
  },

  // Tooltips
  tooltips: {
    viewOnNpm: 'Ver no npm',
    deprecated: 'Obsoleto',
    vulnerabilities: '{{count}} vulnerabilidades encontradas',
    noSecurityIssues: 'Nenhum problema de segurança detectado',
    viewChangelog: 'Ver changelog',
    uninstallPackage: 'Desinstalar este pacote',
    ignorePackage: 'Ignorar este pacote',
    unignorePackage: 'Não ignorar pacote',
    selectForUpdate: 'Selecionar para atualização',
    noUpdateAvailable: 'Nenhuma atualização disponível',
    selectAllUpdates: 'Selecionar todos os pacotes com atualizações',
    refreshDependencies: 'Atualizar dependências (limpar cache)',
    showOnlyUpdates: 'Mostrar apenas pacotes com atualizações',
    showAllPackages: 'Mostrar todos os pacotes',
    rollbackUpdate: 'Reverter última atualização ({{count}} pacote)',
    rollbackUpdate_plural: 'Reverter última atualização ({{count}} pacotes)',
  },

  // Placeholders
  placeholders: {
    filterPackages: 'Filtrar pacotes...',
    searchNpm: 'Pesquisar pacotes npm...',
  },

  // Loading and empty states
  states: {
    loading: 'Carregando dependências...',
    checking: 'verificando...',
    checkingShort: '-',
    noDependencies: 'Nenhuma dependência encontrada no package.json',
    allUpToDate: 'Todos os pacotes estão atualizados! Clique em "Mostrar Todos" para ver tudo.',
    noMatchFilter: 'Nenhum pacote corresponde ao filtro atual',
    searching: 'Pesquisando...',
  },

  // Footer
  footer: {
    showing: 'Mostrando {{filtered}} de {{total}} pacotes',
    ignored: '({{count}} ignorado)',
    updatesAvailable: '{{count}} atualização disponível',
    updatesAvailable_plural: '{{count}} atualizações disponíveis',
  },

  // Search panel
  search: {
    title: 'Instalar Pacotes',
    noResults: 'Nenhum pacote encontrado para "{{query}}"',
    weeklyDownloads: '{{downloads}}/sem',
    updated: 'Atualizado {{date}}',
    alreadyInstalled: '{{name}} já está instalado',
    installAsDev: 'Instalar como dependência de desenvolvimento',
    confirmInstall: 'Instalar {{name}}@{{version}}?',
  },

  // Modal titles
  modals: {
    uninstallTitle: 'Desinstalar Pacote',
    updateTitle: 'Atualizar Pacote',
    updateAllTitle: 'Atualizar Todos os Pacotes',
    updateSelectedTitle: 'Atualizar Pacotes Selecionados',
    ignoreTitle: 'Ignorar Pacote',
    unignoreTitle: 'Não Ignorar Pacote',
    rollbackTitle: 'Reverter Atualização',
  },

  // Modal messages
  modalMessages: {
    confirmUninstall: 'Tem certeza de que deseja desinstalar <strong>{{name}}</strong>?',
    confirmUpdate: 'Tem certeza de que deseja atualizar <strong>{{name}}</strong>?',
    confirmUpdateAll: 'Tem certeza de que deseja atualizar <strong>{{count}} pacote</strong>?',
    confirmUpdateAll_plural: 'Tem certeza de que deseja atualizar <strong>{{count}} pacotes</strong>?',
    confirmUpdateSelected: 'Tem certeza de que deseja atualizar <strong>{{count}} pacote selecionado</strong>?',
    confirmUpdateSelected_plural:
      'Tem certeza de que deseja atualizar <strong>{{count}} pacotes selecionados</strong>?',
    confirmIgnore: 'Tem certeza de que deseja ignorar <strong>{{name}}</strong>?',
    confirmUnignore: 'Tem certeza de que deseja não ignorar <strong>{{name}}</strong>?',
    confirmRollback: 'Reverter <strong>{{count}} pacote</strong> para versões anteriores?',
    confirmRollback_plural: 'Reverter <strong>{{count}} pacotes</strong> para versões anteriores?',
    rollbackDetails: 'Os seguintes pacotes serão restaurados para suas versões anteriores:',
    ignoreHint: 'Pacotes ignorados são excluídos das verificações de atualização e dos contadores.',
    andMore: '...e mais {{count}}',
  },

  // Ignored section
  ignored: {
    title: 'Ignorados ({{count}})',
  },

  // App header
  header: {
    showUpdatesOnly: 'Mostrar Apenas Atualizações',
    showAllPackages: 'Mostrar Todos',
  },

  // Time ago
  timeAgo: {
    days: 'há {{count}} dias',
    days_singular: 'há {{count}} dia',
    months: 'há {{count}} meses',
    months_singular: 'há {{count}} mês',
    years: 'há {{count}} anos',
    years_singular: 'há {{count}} ano',
  },

  // Semver update types
  semver: {
    major: 'MAJOR',
    minor: 'MINOR',
    patch: 'PATCH',
  },
};
