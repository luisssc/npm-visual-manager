import { useState, useCallback, useEffect } from 'react';
import { DependencyTable } from './components/DependencyTable';
import { useVsCodeApi, useVsCodeMessages } from './hooks/useVsCodeApi';
import { Dependency, HostToWebviewMessage } from './types';
import './App.css';

function App() {
  const { requestDependencies, updatePackage, updateAllPackages, isReady } = useVsCodeApi();
  
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [packageName, setPackageName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  // Manejar mensajes del Extension Host
  const handleMessage = useCallback((message: HostToWebviewMessage) => {
    switch (message.type) {
      case 'DEPENDENCIES_DATA':
        setDependencies(message.dependencies);
        setPackageName(message.packageName);
        setIsLoading(false);
        setError(null);
        break;

      case 'VERSION_CHECK_RESULT':
        setDependencies(prev => 
          prev.map(dep => 
            dep.name === message.dependency.name
              ? {
                  ...dep,
                  latestVersion: message.latestVersion,
                  updateAvailable: isUpdateAvailable(dep.installedVersion, message.latestVersion)
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

  const handleUpdatePackage = (packageName: string, version: string) => {
    updatePackage(packageName, version);
  };

  const handleUpdateAll = (packages: { name: string; version: string }[]) => {
    updateAllPackages(packages);
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
        <div className="error-icon">⚠</div>
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
        <h1>📦 NPM Visual Manager</h1>
        <span className="package-name">{packageName}</span>
      </header>

      <main className="app-content">
        <DependencyTable
          dependencies={dependencies}
          onUpdatePackage={handleUpdatePackage}
          onUpdateAll={handleUpdateAll}
          isLoading={isLoading}
        />
      </main>
    </div>
  );
}

export default App;
