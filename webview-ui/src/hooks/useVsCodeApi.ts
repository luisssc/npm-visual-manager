import { useEffect, useRef, useCallback, useState } from 'react';
import type { WebviewToHostMessage, HostToWebviewMessage, Dependency } from '../../../types';

// Type for the VS Code API acquired via acquireVsCodeApi
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

  const updatePackage = useCallback(
    (packageName: string, version: string, currentVersion?: string) => {
      postMessage({ type: 'UPDATE_PACKAGE', packageName, version, currentVersion });
    },
    [postMessage]
  );

  const updateAllPackages = useCallback(
    (packages: { name: string; version: string }[]) => {
      postMessage({ type: 'UPDATE_ALL_PACKAGES', packages });
    },
    [postMessage]
  );

  const checkUpdates = useCallback(
    (dependencies: Dependency[]) => {
      postMessage({ type: 'CHECK_UPDATES', dependencies });
    },
    [postMessage]
  );

  const selectProject = useCallback(
    (path: string) => {
      postMessage({ type: 'SELECT_PROJECT', path });
    },
    [postMessage]
  );

  const rollbackLast = useCallback(() => {
    postMessage({ type: 'ROLLBACK_LAST' });
  }, [postMessage]);

  const toggleIgnorePackage = useCallback(
    (packageName: string, currentVersion?: string) => {
      postMessage({ type: 'TOGGLE_IGNORE_PACKAGE', packageName, currentVersion });
    },
    [postMessage]
  );

  const refreshCache = useCallback(() => {
    postMessage({ type: 'REFRESH_CACHE' });
  }, [postMessage]);

  const searchPackages = useCallback(
    (query: string) => {
      postMessage({ type: 'SEARCH_PACKAGES', query });
    },
    [postMessage]
  );

  const installNewPackage = useCallback(
    (packageName: string, version: string, isDev: boolean) => {
      postMessage({ type: 'INSTALL_NEW_PACKAGE', packageName, version, isDev });
    },
    [postMessage]
  );

  const runAudit = useCallback(() => {
    postMessage({ type: 'GET_AUDIT' });
  }, [postMessage]);

  const openExternal = useCallback(
    (url: string) => {
      postMessage({ type: 'OPEN_EXTERNAL', url });
    },
    [postMessage]
  );

  const uninstallPackage = useCallback(
    (packageName: string) => {
      postMessage({ type: 'UNINSTALL_PACKAGE', packageName });
    },
    [postMessage]
  );

  return {
    get vscode() {
      return vscodeRef.current;
    },
    isReady,
    postMessage,
    requestDependencies,
    updatePackage,
    updateAllPackages,
    checkUpdates,
    selectProject,
    rollbackLast,
    toggleIgnorePackage,
    refreshCache,
    searchPackages,
    installNewPackage,
    runAudit,
    openExternal,
    uninstallPackage,
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
