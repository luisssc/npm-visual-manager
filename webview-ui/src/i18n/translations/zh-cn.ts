import { Translations } from './en';

export const zhCn: Translations = {
  // Buttons
  buttons: {
    update: '更新',
    updateAll: '更新全部',
    updateSelected: '更新选中',
    install: '安装',
    uninstall: '卸载',
    cancel: '取消',
    rollback: '回滚',
    ignore: '忽略',
    unignore: '取消忽略',
    goBack: '返回',
    retry: '重试',
    yesUninstall: '是的，卸载',
  },

  // Column headers
  columns: {
    package: '包',
    type: '类型',
    installed: '已安装',
    latest: '最新',
    size: '大小',
    update: '更新',
    lastUpdate: '最后更新',
    action: '操作',
  },

  // Dependency types
  dependencyTypes: {
    prod: '生产',
    dev: '开发',
    peer: '同级',
  },

  // Tooltips
  tooltips: {
    viewOnNpm: '在 npm 上查看',
    deprecated: '已弃用',
    vulnerabilities: '发现 {{count}} 个漏洞',
    noSecurityIssues: '未检测到安全问题',
    viewChangelog: '查看更新日志',
    uninstallPackage: '卸载此包',
    ignorePackage: '忽略此包',
    unignorePackage: '取消忽略包',
    selectForUpdate: '选择以更新',
    noUpdateAvailable: '无可用更新',
    selectAllUpdates: '选择所有可更新的包',
    refreshDependencies: '刷新依赖（清除缓存）',
    showOnlyUpdates: '仅显示有更新的包',
    showAllPackages: '显示所有包',
    rollbackUpdate: '回滚上次更新 ({{count}} 个包)',
    rollbackUpdate_plural: '回滚上次更新 ({{count}} 个包)',
  },

  // Placeholders
  placeholders: {
    filterPackages: '筛选包...',
    searchNpm: '搜索 npm 包...',
  },

  // Loading and empty states
  states: {
    loading: '正在加载依赖...',
    checking: '检查中...',
    checkingShort: '-',
    noDependencies: '在 package.json 中未找到依赖',
    allUpToDate: '所有包都是最新的！点击"显示全部"查看所有内容。',
    noMatchFilter: '没有包符合当前筛选条件',
    searching: '搜索中...',
  },

  // Footer
  footer: {
    showing: '显示 {{filtered}} / {{total}} 个包',
    ignored: '({{count}} 个已忽略)',
    updatesAvailable: '{{count}} 个更新可用',
    updatesAvailable_plural: '{{count}} 个更新可用',
  },

  // Search panel
  search: {
    title: '安装包',
    noResults: '未找到 "{{query}}" 的相关包',
    weeklyDownloads: '{{downloads}}/周',
    updated: '更新于 {{date}}',
    alreadyInstalled: '{{name}} 已安装',
    installAsDev: '作为开发依赖安装',
    confirmInstall: '安装 {{name}}@{{version}}?',
  },

  // Modal titles
  modals: {
    uninstallTitle: '卸载包',
    updateTitle: '更新包',
    updateAllTitle: '更新所有包',
    updateSelectedTitle: '更新选中的包',
    ignoreTitle: '忽略包',
    unignoreTitle: '取消忽略包',
    rollbackTitle: '回滚更新',
  },

  // Modal messages
  modalMessages: {
    confirmUninstall: '确定要卸载 <strong>{{name}}</strong> 吗？',
    confirmUpdate: '确定要更新 <strong>{{name}}</strong> 吗？',
    confirmUpdateAll: '确定要更新 <strong>{{count}}</strong> 个包吗？',
    confirmUpdateAll_plural: '确定要更新 <strong>{{count}}</strong> 个包吗？',
    confirmUpdateSelected: '确定要更新 <strong>{{count}}</strong> 个选中的包吗？',
    confirmUpdateSelected_plural: '确定要更新 <strong>{{count}}</strong> 个选中的包吗？',
    confirmIgnore: '确定要忽略 <strong>{{name}}</strong> 吗？',
    confirmUnignore: '确定要取消忽略 <strong>{{name}}</strong> 吗？',
    confirmRollback: '确定要将 <strong>{{count}}</strong> 个包回滚到之前的版本吗？',
    confirmRollback_plural: '确定要将 <strong>{{count}}</strong> 个包回滚到之前的版本吗？',
    rollbackDetails: '以下包将恢复到其先前版本：',
    ignoreHint: '已忽略的包将被排除在更新检查和计数器之外。',
    andMore: '...还有 {{count}} 个',
  },

  // Ignored section
  ignored: {
    title: '已忽略 ({{count}})',
  },

  // App header
  header: {
    showUpdatesOnly: '仅显示更新',
    showAllPackages: '显示全部',
  },

  // Time ago
  timeAgo: {
    days: '{{count}} 天前',
    days_singular: '{{count}} 天前',
    months: '{{count}} 个月前',
    months_singular: '{{count}} 个月前',
    years: '{{count}} 年前',
    years_singular: '{{count}} 年前',
  },

  // Semver update types
  semver: {
    major: '主要',
    minor: '次要',
    patch: '补丁',
  },
};
