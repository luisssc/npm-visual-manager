import { useState, useCallback, useEffect } from 'react';
import { DependencyTable } from './components/DependencyTable';
import { useVsCodeApi, useVsCodeMessages } from './hooks/useVsCodeApi';
import { Dependency, HostToWebviewMessage, ColumnConfig, ProjectInfo, PackageManager, VersionInfo } from './types';
import './App.css';

function App() {
  const { requestDependencies, updatePackage, updateAllPackages, selectProject, isReady } = useVsCodeApi();
  
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
    semverUpdate: true
  });
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [currentProjectPath, setCurrentProjectPath] = useState<string>('');
  const [showAllPackages, setShowAllPackages] = useState(false);
  const [packageManager, setPackageManager] = useState<PackageManager>('npm');
  const [versions, setVersions] = useState<VersionInfo | null>(null);

  // Manejar mensajes del Extension Host
  const handleMessage = useCallback((message: HostToWebviewMessage) => {
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
                  updateAvailable: isUpdateAvailable(dep.installedVersion, message.latestVersion),
                  semverUpdateType: message.semverUpdateType,
                  lastPublishDate: message.lastPublishDate
                }
              : dep
          )
        );
        break;

      case 'UPDATE_RESULT':
        setProgressMessage(message.success ? null : message.message);
        if (!message.success) {
          setError(message.message);
        }
        break;

      case 'PROGRESS':
        setProgressMessage(message.message);
        break;

      case 'ERROR':
        setError(message.message);
        setIsLoading(false);
        break;
    }
  }, []);

  useVsCodeMessages(handleMessage);

  // Solicitar dependencias al montar
  useEffect(() => {
    if (isReady) {
      requestDependencies();
    }
  }, [isReady, requestDependencies]);

  // Función auxiliar para comparar versiones
  function isUpdateAvailable(installed: string, latest: string): boolean {
    const clean = (v: string) => v.replace(/^[\^~>=<]+/, '');
    return clean(installed) !== latest;
  }

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

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    requestDependencies();
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span>Loading dependencies...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-icon"><i className="codicon codicon-error" /></div>
        <p className="error-message">{error}</p>
        <button className="retry-btn" onClick={handleRetry}>
          Retry
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
        <h1><i className="codicon codicon-package" /> NPM Visual Manager</h1>
        <div className="header-controls">
          {projects.length > 1 ? (
            <select 
              className="project-selector"
              value={currentProjectPath}
              onChange={(e) => handleSelectProject(e.target.value)}
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
            title={showAllPackages ? "Show only packages with updates" : "Show all packages"}
          >
            {showAllPackages
              ? <><i className="codicon codicon-check" /> Show Updates Only</>
              : <><i className="codicon codicon-list-flat" /> Show All Packages</>
            }
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
        />
      </main>
    </div>
  );
}

export default App;
