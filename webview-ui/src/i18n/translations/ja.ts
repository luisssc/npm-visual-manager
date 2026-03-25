import { Translations } from './en';

export const ja: Translations = {
  // Buttons
  buttons: {
    update: '更新',
    updateAll: 'すべて更新',
    updateSelected: '選択項目を更新',
    install: 'インストール',
    uninstall: 'アンインストール',
    cancel: 'キャンセル',
    rollback: 'ロールバック',
    ignore: '無視',
    unignore: '無視を解除',
    goBack: '戻る',
    retry: '再試行',
    yesUninstall: 'はい、アンインストールします',
  },

  // Column headers
  columns: {
    package: 'パッケージ',
    type: 'タイプ',
    installed: 'インストール済み',
    latest: '最新',
    size: 'サイズ',
    update: '更新',
    lastUpdate: '最終更新',
    action: 'アクション',
  },

  // Dependency types
  dependencyTypes: {
    prod: '本番',
    dev: '開発',
    peer: 'ピア',
  },

  // Tooltips
  tooltips: {
    viewOnNpm: 'npm で表示',
    deprecated: '非推奨',
    vulnerabilities: '{{count}} 件の脆弱性が見つかりました',
    noSecurityIssues: 'セキュリティ問題は検出されませんでした',
    viewChangelog: '変更履歴を表示',
    uninstallPackage: 'このパッケージをアンインストール',
    ignorePackage: 'このパッケージを無視',
    unignorePackage: '無視を解除',
    selectForUpdate: '更新用に選択',
    noUpdateAvailable: '更新はありません',
    selectAllUpdates: '更新可能なすべてのパッケージを選択',
    refreshDependencies: '依存関係を更新（キャッシュをクリア）',
    showOnlyUpdates: '更新があるパッケージのみ表示',
    showAllPackages: 'すべてのパッケージを表示',
    rollbackUpdate: '最後の更新をロールバック ({{count}} 件)',
    rollbackUpdate_plural: '最後の更新をロールバック ({{count}} 件)',
  },

  // Placeholders
  placeholders: {
    filterPackages: 'パッケージをフィルタ...',
    searchNpm: 'npm パッケージを検索...',
  },

  // Loading and empty states
  states: {
    loading: '依存関係を読み込み中...',
    checking: '確認中...',
    checkingShort: '-',
    noDependencies: 'package.json に依存関係が見つかりません',
    allUpToDate: 'すべてのパッケージは最新です！「すべて表示」をクリックしてすべてを表示します。',
    noMatchFilter: '現在のフィルタに一致するパッケージがありません',
    searching: '検索中...',
  },

  // Footer
  footer: {
    showing: '{{total}} 件中 {{filtered}} 件を表示',
    ignored: '({{count}} 件無視)',
    updatesAvailable: '{{count}} 件の更新が可能',
    updatesAvailable_plural: '{{count}} 件の更新が可能',
  },

  // Search panel
  search: {
    title: 'パッケージをインストール',
    noResults: '"{{query}}" のパッケージが見つかりません',
    weeklyDownloads: '{{downloads}}/週',
    updated: '{{date}} に更新',
    alreadyInstalled: '{{name}} は既にインストールされています',
    installAsDev: '開発依存関係としてインストール',
    confirmInstall: '{{name}}@{{version}} をインストールしますか？',
  },

  // Modal titles
  modals: {
    uninstallTitle: 'パッケージをアンインストール',
    updateTitle: 'パッケージを更新',
    updateAllTitle: 'すべてのパッケージを更新',
    updateSelectedTitle: '選択したパッケージを更新',
    ignoreTitle: 'パッケージを無視',
    unignoreTitle: '無視を解除',
    rollbackTitle: '更新をロールバック',
  },

  // Modal messages
  modalMessages: {
    confirmUninstall: '<strong>{{name}}</strong> をアンインストールしてもよろしいですか？',
    confirmUpdate: '<strong>{{name}}</strong> を更新してもよろしいですか？',
    confirmUpdateAll: '<strong>{{count}}</strong> 件のパッケージを更新してもよろしいですか？',
    confirmUpdateAll_plural: '<strong>{{count}}</strong> 件のパッケージを更新してもよろしいですか？',
    confirmUpdateSelected: '選択した <strong>{{count}}</strong> 件のパッケージを更新してもよろしいですか？',
    confirmUpdateSelected_plural: '選択した <strong>{{count}}</strong> 件のパッケージを更新してもよろしいですか？',
    confirmIgnore: '<strong>{{name}}</strong> を無視してもよろしいですか？',
    confirmUnignore: '<strong>{{name}}</strong> の無視を解除してもよろしいですか？',
    confirmRollback: '<strong>{{count}}</strong> 件のパッケージを以前のバージョンにロールバックしますか？',
    confirmRollback_plural: '<strong>{{count}}</strong> 件のパッケージを以前のバージョンにロールバックしますか？',
    rollbackDetails: '以下のパッケージは以前のバージョンに復元されます：',
    ignoreHint: '無視されたパッケージは更新チェックとカウンターから除外されます。',
    andMore: '...他 {{count}} 件',
  },

  // Ignored section
  ignored: {
    title: '無視 ({{count}})',
  },

  // App header
  header: {
    showUpdatesOnly: '更新のみ表示',
    showAllPackages: 'すべて表示',
  },

  // Time ago
  timeAgo: {
    days: '{{count}} 日前',
    days_singular: '{{count}} 日前',
    months: '{{count}} ヶ月前',
    months_singular: '{{count}} ヶ月前',
    years: '{{count}} 年前',
    years_singular: '{{count}} 年前',
  },

  // Semver update types
  semver: {
    major: 'メジャー',
    minor: 'マイナー',
    patch: 'パッチ',
  },
};
