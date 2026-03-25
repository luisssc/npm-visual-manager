import { Translations } from './en';

export const ko: Translations = {
  // Buttons
  buttons: {
    update: '업데이트',
    updateAll: '모두 업데이트',
    updateSelected: '선택 항목 업데이트',
    install: '설치',
    uninstall: '제거',
    cancel: '취소',
    rollback: '롤백',
    ignore: '무시',
    unignore: '무시 해제',
    goBack: '뒤로',
    retry: '재시도',
    yesUninstall: '예, 제거합니다',
  },

  // Column headers
  columns: {
    package: '패키지',
    type: '유형',
    installed: '설치됨',
    latest: '최신',
    size: '크기',
    update: '업데이트',
    lastUpdate: '마지막 업데이트',
    action: '작업',
  },

  // Dependency types
  dependencyTypes: {
    prod: '프로덕션',
    dev: '개발',
    peer: '피어',
  },

  // Tooltips
  tooltips: {
    viewOnNpm: 'npm에서 보기',
    deprecated: '사용 중단',
    vulnerabilities: '취약점 {{count}}개 발견',
    noSecurityIssues: '보안 문제가 감지되지 않음',
    viewChangelog: '변경 로그 보기',
    uninstallPackage: '이 패키지 제거',
    ignorePackage: '이 패키지 무시',
    unignorePackage: '패키지 무시 해제',
    selectForUpdate: '업데이트를 위해 선택',
    noUpdateAvailable: '사용 가능한 업데이트 없음',
    selectAllUpdates: '업데이트가 있는 모든 패키지 선택',
    refreshDependencies: '의존성 새로고침 (캐시 지우기)',
    showOnlyUpdates: '업데이트가 있는 패키지만 표시',
    showAllPackages: '모든 패키지 표시',
    rollbackUpdate: '마지막 업데이트 롤백 ({{count}}개 패키지)',
    rollbackUpdate_plural: '마지막 업데이트 롤백 ({{count}}개 패키지)',
  },

  // Placeholders
  placeholders: {
    filterPackages: '패키지 필터링...',
    searchNpm: 'npm 패키지 검색...',
  },

  // Loading and empty states
  states: {
    loading: '의존성 로드 중...',
    checking: '확인 중...',
    checkingShort: '-',
    noDependencies: 'package.json에서 의존성을 찾을 수 없음',
    allUpToDate: '모든 패키지가 최신 상태입니다! "모두 표시"를 클릭하여 모든 것을 확인하세요.',
    noMatchFilter: '현재 필터와 일치하는 패키지가 없음',
    searching: '검색 중...',
  },

  // Footer
  footer: {
    showing: '{{total}}개 중 {{filtered}}개 패키지 표시',
    ignored: '({{count}}개 무시)',
    updatesAvailable: '{{count}}개 업데이트 가능',
    updatesAvailable_plural: '{{count}}개 업데이트 가능',
  },

  // Search panel
  search: {
    title: '패키지 설치',
    noResults: '"{{query}}"에 대한 패키지를 찾을 수 없음',
    weeklyDownloads: '{{downloads}}/주',
    updated: '{{date}}에 업데이트됨',
    alreadyInstalled: '{{name}}이(가) 이미 설치되어 있음',
    installAsDev: '개발 의존성으로 설치',
    confirmInstall: '{{name}}@{{version}}을(를) 설치하시겠습니까?',
  },

  // Modal titles
  modals: {
    uninstallTitle: '패키지 제거',
    updateTitle: '패키지 업데이트',
    updateAllTitle: '모든 패키지 업데이트',
    updateSelectedTitle: '선택한 패키지 업데이트',
    ignoreTitle: '패키지 무시',
    unignoreTitle: '패키지 무시 해제',
    rollbackTitle: '업데이트 롤백',
  },

  // Modal messages
  modalMessages: {
    confirmUninstall: '<strong>{{name}}</strong>을(를) 제거하시겠습니까?',
    confirmUpdate: '<strong>{{name}}</strong>을(를) 업데이트하시겠습니까?',
    confirmUpdateAll: '<strong>{{count}}개 패키지</strong>를 업데이트하시겠습니까?',
    confirmUpdateAll_plural: '<strong>{{count}}개 패키지</strong>를 업데이트하시겠습니까?',
    confirmUpdateSelected: '<strong>{{count}}개 선택한 패키지</strong>를 업데이트하시겠습니까?',
    confirmUpdateSelected_plural: '<strong>{{count}}개 선택한 패키지</strong>를 업데이트하시겠습니까?',
    confirmIgnore: '<strong>{{name}}</strong>을(를) 무시하시겠습니까?',
    confirmUnignore: '<strong>{{name}}</strong>의 무시를 해제하시겠습니까?',
    confirmRollback: '<strong>{{count}}개 패키지</strong>를 이전 버전으로 롤백하시겠습니까?',
    confirmRollback_plural: '<strong>{{count}}개 패키지</strong>를 이전 버전으로 롤백하시겠습니까?',
    rollbackDetails: '다음 패키지가 이전 버전으로 복원됩니다:',
    ignoreHint: '무시된 패키지는 업데이트 확인 및 카운터에서 제외됩니다.',
    andMore: '...그리고 {{count}}개 더',
  },

  // Ignored section
  ignored: {
    title: '무시 ({{count}})',
  },

  // App header
  header: {
    showUpdatesOnly: '업데이트만 표시',
    showAllPackages: '모두 표시',
  },

  // Time ago
  timeAgo: {
    days: '{{count}}일 전',
    days_singular: '{{count}}일 전',
    months: '{{count}}개월 전',
    months_singular: '{{count}}개월 전',
    years: '{{count}}년 전',
    years_singular: '{{count}}년 전',
  },

  // Semver update types
  semver: {
    major: '주요',
    minor: '부분',
    patch: '패치',
  },
};
