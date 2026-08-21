import { Translations } from './en';

export const es: Translations = {
  // Buttons
  buttons: {
    update: 'Actualizar',
    updateAll: 'Actualizar Todo',
    updateSelected: 'Actualizar Seleccionados',
    install: 'Instalar',
    uninstall: 'Desinstalar',
    cancel: 'Cancelar',
    rollback: 'Deshacer',
    ignore: 'Ignorar',
    unignore: 'No ignorar',
    goBack: 'Volver',
    retry: 'Reintentar',
    yesUninstall: 'Sí, Desinstalar',
    showMore: 'Mostrar {{count}} más',
    showLess: 'Mostrar menos',
    viewAdvisory: 'Ver Aviso',
  },

  // Column headers
  columns: {
    package: 'Paquete',
    type: 'Tipo',
    installed: 'Instalado',
    latest: 'Última',
    size: 'Tamaño',
    update: 'Actualización',
    lastUpdate: 'Última Actualización',
    action: 'Acción',
  },

  // Dependency types
  dependencyTypes: {
    prod: 'Prod',
    dev: 'Dev',
    peer: 'Peer',
  },

  // Tooltips
  tooltips: {
    viewOnNpm: 'Ver en npm',
    deprecated: 'Obsoleto',
    vulnerabilities: '{{count}} vulnerabilidades encontradas',
    noSecurityIssues: 'No se detectaron problemas de seguridad',
    viewChangelog: 'Ver changelog',
    uninstallPackage: 'Desinstalar este paquete',
    ignorePackage: 'Ignorar este paquete',
    unignorePackage: 'No ignorar paquete',
    selectForUpdate: 'Seleccionar para actualizar',
    noUpdateAvailable: 'No hay actualización disponible',
    selectAllUpdates: 'Seleccionar todos los paquetes con actualizaciones',
    refreshDependencies: 'Refrescar dependencias (limpia caché)',
    showOnlyUpdates: 'Mostrar solo paquetes con actualizaciones',
    showAllPackages: 'Mostrar todos los paquetes',
    rollbackUpdate: 'Deshacer última actualización ({{count}} paquete)',
    rollbackUpdate_plural: 'Deshacer última actualización ({{count}} paquetes)',
    openPackageJson: 'Abrir este package.json',
  },

  // Placeholders
  placeholders: {
    filterPackages: 'Filtrar paquetes...',
    searchNpm: 'Buscar paquetes npm...',
  },

  // Loading and empty states
  states: {
    loading: 'Cargando dependencias...',
    checking: 'comprobando...',
    checkingShort: '-',
    noDependencies: 'No se encontraron dependencias en package.json',
    allUpToDate: '¡Todos los paquetes están actualizados! Haz clic en "Mostrar Todos" para ver todo.',
    noMatchFilter: 'Ningún paquete coincide con el filtro actual',
    searching: 'Buscando...',
    loadingVersions: 'Cargando versiones...',
  },

  // Footer
  footer: {
    showing: 'Mostrando {{filtered}} de {{total}} paquetes',
    ignored: '({{count}} ignorados)',
    updatesAvailable: '{{count}} actualización disponible',
    updatesAvailable_plural: '{{count}} actualizaciones disponibles',
  },

  // Search panel
  search: {
    title: 'Instalar Paquetes',
    noResults: 'No se encontraron paquetes para "{{query}}"',
    weeklyDownloads: '{{downloads}}/sem',
    updated: 'Actualizado {{date}}',
    alreadyInstalled: '{{name}} ya está instalado',
    installAsDev: 'Instalar como dependencia de desarrollo',
    confirmInstall: '¿Instalar {{name}}@{{version}}?',
  },

  // Modal titles
  modals: {
    uninstallTitle: 'Desinstalar Paquete',
    updateTitle: 'Actualizar Paquete',
    updateAllTitle: 'Actualizar Todos los Paquetes',
    updateSelectedTitle: 'Actualizar Paquetes Seleccionados',
    ignoreTitle: 'Ignorar Paquete',
    unignoreTitle: 'No Ignorar Paquete',
    rollbackTitle: 'Deshacer Actualización',
    selectVersionTitle: 'Seleccionar Versión para {{name}}',
    saveExactEnabled: '--save-exact habilitado',
  },

  // Modal messages
  modalMessages: {
    confirmUninstall: '¿Estás seguro de que quieres desinstalar <strong>{{name}}</strong>?',
    confirmUpdate: '¿Estás seguro de que quieres actualizar <strong>{{name}}</strong>?',
    confirmUpdateAll: '¿Estás seguro de que quieres actualizar <strong>{{count}} paquete</strong>?',
    confirmUpdateAll_plural: '¿Estás seguro de que quieres actualizar <strong>{{count}} paquetes</strong>?',
    confirmUpdateSelected: '¿Estás seguro de que quieres actualizar <strong>{{count}} paquete seleccionado</strong>?',
    confirmUpdateSelected_plural:
      '¿Estás seguro de que quieres actualizar <strong>{{count}} paquetes seleccionados</strong>?',
    confirmIgnore: '¿Estás seguro de que quieres ignorar <strong>{{name}}</strong>?',
    confirmUnignore: '¿Estás seguro de que quieres dejar de ignorar <strong>{{name}}</strong>?',
    confirmRollback: '¿Deshacer la actualización de <strong>{{count}} paquete</strong> a versiones anteriores?',
    confirmRollback_plural: '¿Deshacer la actualización de <strong>{{count}} paquetes</strong> a versiones anteriores?',
    rollbackDetails: 'Los siguientes paquetes serán restaurados a sus versiones anteriores:',
    targetFileLabel: 'Se aplica a',
    ignoreHint: 'Los paquetes ignorados se excluyen de las comprobaciones de actualización y los contadores.',
    andMore: '...y {{count}} más',
    selectVersionHint: 'Elige la versión que quieres instalar:',
  },

  // Labels
  labels: {
    latest: 'última',
    deprecated: 'obsoleto',
    prerelease: 'pre-release',
  },

  // Ignored section
  ignored: {
    title: 'Ignorados ({{count}})',
  },

  // App header
  header: {
    showUpdatesOnly: 'Solo Actualizaciones',
    showAllPackages: 'Mostrar Todos',
  },

  // Time ago
  timeAgo: {
    days: 'hace {{count}} días',
    days_singular: 'hace {{count}} día',
    months: 'hace {{count}} meses',
    months_singular: 'hace {{count}} mes',
    years: 'hace {{count}} años',
    years_singular: 'hace {{count}} año',
  },

  // Why installed modal
  whyInstalled: {
    tooltip: '¿Por qué está instalado este paquete?',
    title: '¿Por qué está instalado {{name}}?',
    loading: 'Analizando árbol de dependencias...',
    directBadge: 'Directa',
    direct: 'Declarada directamente en tu package.json',
    noResults: 'No se encontraron cadenas de dependencia para este paquete.',
    unsupported: 'Esta vista aún no está soportada en proyectos con bun.',
    notInstalled: 'Las dependencias no están instaladas en este proyecto, así que no se puede analizar el árbol. Es habitual en librerías compartidas cuyas dependencias las instala el proyecto que las consume. Ejecuta la instalación aquí para habilitar esta vista.',
    close: 'Cerrar',
    alsoRequiredBy: 'También lo requieren otros paquetes:',
    onlyDirect: 'Ningún otro paquete instalado depende de él — si dejas de usarlo, puedes quitarlo sin romper nada.',
  },

  // Semver update types
  semver: {
    major: 'MAJOR',
    minor: 'MINOR',
    patch: 'PATCH',
  },
};
