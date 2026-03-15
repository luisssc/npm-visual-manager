import { useState, useCallback, useEffect, useRef } from 'react';
import { DependencyTable } from './components/DependencyTable';
import { SearchPanel } from './components/SearchPanel';
import { useVsCodeApi, useVsCodeMessages } from './hooks/useVsCodeApi';
import type {
  Dependency,
  HostToWebviewMessage,
  ColumnConfig,
  ProjectInfo,
  PackageManager,
  VersionInfo,
  UpdateHistory,
  SearchResult,
} from '../../types';
import './App.css';
import { useTranslation } from './i18n/I18nContext';

function App() {
  const t = useTranslation();
  const {
    requestDependencies,
    updatePackage,
    updateAllPackages,
    selectProject,
    rollbackLast,
    toggleIgnorePackage,
    refreshCache,
    searchPackages,
    installNewPackage,
    openExternal,
    uninstallPackage,
    isReady,
  } = useVsCodeApi();

  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [packageName, setPackageName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [columnConfig, setColumnConfig] = useState<ColumnConfig>({
    size: true,
    type: false,
    lastUpdate: true,
    security: true,
    semverUpdate: true,
  });
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [currentProjectPath, setCurrentProjectPath] = useState<string>('');
  const [showAllPackages, setShowAllPackages] = useState(false);
  const [packageManager, setPackageManager] = useState<PackageManager>('npm');
  const [versions, setVersions] = useState<VersionInfo | null>(null);
  const [lastUpdate, setLastUpdate] = useState<UpdateHistory | null>(null);
  const [rollbackMessage, setRollbackMessage] = useState<string | null>(null);
  const cacheInfoRef = useRef<{ fromCache: boolean; age?: number } | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Handle messages from Extension Host
  const handleMessage = useCallback(
    (message: HostToWebviewMessage) => {
      switch (message.type) {
        case 'DEPENDENCIES_DATA':
          setDependencies(message.dependencies);
          setPackageName(message.packageName);
          setColumnConfig(message.columnConfig);
          if (message.projects) {
            setProjects(message.projects);
          }
          if (message.currentProjectPath) {
            setCurrentProjectPath(message.currentProjectPath);
          }
          if (message.packageManager) {
            setPackageManager(message.packageManager);
          }
          if (message.versions) {
            setVersions(message.versions);
          }
          if (message.lastUpdate !== undefined) {
            setLastUpdate(message.lastUpdate);
          }
          setIsLoading(false);
          setError(null);
          break;

        case 'COLUMN_CONFIG':
          setColumnConfig(message.config);
          break;

        case 'VERSION_CHECK_RESULT':
          setDependencies(prev =>
            prev.map(dep =>
              dep.name === message.dependency.name
                ? {
                    ...dep,
                    latestVersion: message.latestVersion,
                    updateAvailable:
                      !!message.semverUpdateType &&
                      message.semverUpdateType !== 'none' &&
                      message.semverUpdateType !== 'unknown',
                    semverUpdateType: message.semverUpdateType,
                    lastPublishDate: message.lastPublishDate,
                    isDeprecated: message.isDeprecated,
                    deprecationMessage: message.deprecationMessage,
                    repositoryUrl: message.repositoryUrl,
                  }
                : dep
            )
          );
          // Track cache status from first package
          if (message.fromCache !== undefined && !cacheInfoRef.current) {
            cacheInfoRef.current = { fromCache: message.fromCache, age: message.cacheAge };
          }
          break;

        case 'CACHE_CLEARED':
          cacheInfoRef.current = null;
          setProgressMessage(null);
          break;

        case 'SEARCH_RESULTS':
          setSearchResults(message.results);
          setIsSearching(false);
          break;

        case 'IGNORE_TOGGLED':
          setDependencies(prev =>
            prev.map(dep => (dep.name === message.packageName ? { ...dep, isIgnored: message.isIgnored } : dep))
          );
          break;

        case 'UPDATE_RESULT':
          setProgressMessage(null);
          requestDependencies();
          break;

        case 'UNINSTALL_RESULT':
          setProgressMessage(null);
          requestDependencies();
          break;

        case 'ROLLBACK_RESULT':
          setProgressMessage(null);
          if (message.success) {
            setLastUpdate(null);
            setRollbackMessage(message.message);
            setTimeout(() => setRollbackMessage(null), 5000);
          }
          break;

        case 'PROGRESS':
          setProgressMessage(message.message);
          break;

        case 'INSTALL_RESULT':
          setProgressMessage(null);
          break;

        case 'ERROR':
          setError(message.message);
          setIsLoading(false);
          break;
      }
    },
    [requestDependencies]
  );

  useVsCodeMessages(handleMessage);

  // Request dependencies on mount
  useEffect(() => {
    if (isReady) {
      requestDependencies();
    }
  }, [isReady, requestDependencies]);

  const handleUpdatePackage = (packageName: string, version: string, currentVersion?: string) => {
    updatePackage(packageName, version, currentVersion);
  };

  const handleUpdateAll = (packages: { name: string; version: string; currentVersion?: string }[]) => {
    updateAllPackages(packages);
  };

  const handleSelectProject = (path: string) => {
    setCurrentProjectPath(path);
    setIsLoading(true);
    selectProject(path);
  };

  const handleRollback = () => {
    rollbackLast();
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    cacheInfoRef.current = null;
    refreshCache();
  };

  const handleSearch = useCallback(
    (query: string) => {
      if (query.trim().length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      searchPackages(query);
    },
    [searchPackages]
  );

  const handleInstallNew = useCallback(
    (packageName: string, version: string, isDev: boolean) => {
      installNewPackage(packageName, version, isDev);
      setSearchResults([]);
    },
    [installNewPackage]
  );

  const handleOpenExternal = useCallback(
    (url: string) => {
      openExternal(url);
    },
    [openExternal]
  );

  const handleUninstall = useCallback(
    (packageName: string) => {
      uninstallPackage(packageName);
    },
    [uninstallPackage]
  );

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span>{t.states.loading}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-icon">
          <i className="codicon codicon-error" />
        </div>
        <p className="error-message">{error}</p>
        <button className="retry-btn" onClick={handleRetry}>
          {t.buttons.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      {progressMessage && (
        <>
          <div className="progress-bar"></div>
          <div className="progress-message">{progressMessage}</div>
        </>
      )}

      <header className="app-header">
        <h1>
          <i className="codicon codicon-package" /> NPM Visual Manager
        </h1>
        <div className="header-controls">
          {projects.length > 1 ? (
            <select
              className="project-selector"
              value={currentProjectPath}
              onChange={e => handleSelectProject(e.target.value)}
            >
              {projects.map(project => (
                <option key={project.path} value={project.path}>
                  {project.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="package-name">{packageName}</span>
          )}
          <button
            className="toggle-packages-btn"
            onClick={() => setShowAllPackages(!showAllPackages)}
            title={showAllPackages ? t.tooltips.showOnlyUpdates : t.tooltips.showAllPackages}
          >
            {showAllPackages ? (
              <>
                <i className="codicon codicon-check" /> {t.header.showUpdatesOnly}
              </>
            ) : (
              <>
                <i className="codicon codicon-list-flat" /> {t.header.showAllPackages}
              </>
            )}
          </button>
          <button
            className="refresh-btn"
            onClick={handleRetry}
            disabled={isLoading}
            title={t.tooltips.refreshDependencies}
          >
            <i className="codicon codicon-refresh" />
          </button>
        </div>
      </header>

      <main className="app-content">
        <DependencyTable
          dependencies={dependencies}
          onUpdatePackage={handleUpdatePackage}
          onUpdateAll={handleUpdateAll}
          isLoading={isLoading}
          columnConfig={columnConfig}
          showAllPackages={showAllPackages}
          nodeVersion={versions?.nodeVersion}
          packageManager={packageManager}
          packageManagerVersion={versions?.packageManagerVersion}
          lastUpdate={lastUpdate}
          onRollback={handleRollback}
          rollbackMessage={rollbackMessage}
          onToggleIgnore={toggleIgnorePackage}
          onOpenExternal={handleOpenExternal}
          onUninstall={handleUninstall}
        />
        <SearchPanel
          results={searchResults}
          onSearch={handleSearch}
          onInstall={handleInstallNew}
          onUninstall={handleUninstall}
          isLoading={isSearching}
          installedPackages={dependencies}
        />
      </main>
    </div>
  );
}

export default App;
