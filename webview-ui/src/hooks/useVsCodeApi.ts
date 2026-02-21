import { useEffect, useRef, useCallback, useState } from 'react';
import { WebviewToHostMessage, HostToWebviewMessage, Dependency } from '../types';

// Tipo para la API de VS Code adquirida via acquireVsCodeApi
type VSCodeApi = {
  postMessage: (message: WebviewToHostMessage) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VSCodeApi;
  }
}

export function useVsCodeApi() {
  const vscodeRef = useRef<VSCodeApi | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (window.acquireVsCodeApi) {
      vscodeRef.current = window.acquireVsCodeApi();
      setIsReady(true);
    }
  }, []);

  const postMessage = useCallback((message: WebviewToHostMessage) => {
    if (vscodeRef.current) {
      vscodeRef.current.postMessage(message);
    } else {
      console.warn('VS Code API not available');
    }
  }, []);

  const requestDependencies = useCallback(() => {
    postMessage({ type: 'GET_DEPENDENCIES' });
  }, [postMessage]);

  const updatePackage = useCallback((packageName: string, version: string, currentVersion?: string) => {
    postMessage({ type: 'UPDATE_PACKAGE', packageName, version, currentVersion });
  }, [postMessage]);

  const updateAllPackages = useCallback((packages: { name: string; version: string }[]) => {
    postMessage({ type: 'UPDATE_ALL_PACKAGES', packages });
  }, [postMessage]);

  const checkUpdates = useCallback((dependencies: Dependency[]) => {
    postMessage({ type: 'CHECK_UPDATES', dependencies });
  }, [postMessage]);

  const selectProject = useCallback((path: string) => {
    postMessage({ type: 'SELECT_PROJECT', path });
  }, [postMessage]);

  const rollbackLast = useCallback(() => {
    postMessage({ type: 'ROLLBACK_LAST' });
  }, [postMessage]);

  const toggleIgnorePackage = useCallback((packageName: string, currentVersion?: string) => {
    postMessage({ type: 'TOGGLE_IGNORE_PACKAGE', packageName, currentVersion });
  }, [postMessage]);

  const refreshCache = useCallback(() => {
    postMessage({ type: 'REFRESH_CACHE' });
  }, [postMessage]);

  return {
    vscode: vscodeRef.current,
    isReady,
    postMessage,
    requestDependencies,
    updatePackage,
    updateAllPackages,
    checkUpdates,
    selectProject,
    rollbackLast,
    toggleIgnorePackage,
    refreshCache
  };
}

export function useVsCodeMessages(handler: (message: HostToWebviewMessage) => void) {
  useEffect(() => {
    const messageHandler = (event: MessageEvent<HostToWebviewMessage>) => {
      handler(event.data);
    };

    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, [handler]);
}
