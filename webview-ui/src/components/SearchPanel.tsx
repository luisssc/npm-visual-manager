import { memo, useState, useRef, useMemo } from 'react';
import type { SearchResult, Dependency } from '../../../types';
import './SearchPanel.css';
import { useTranslation, interpolate } from '../i18n/I18nContext';

interface SearchPanelProps {
  results: SearchResult[];
  onSearch: (query: string) => void;
  onInstall: (packageName: string, version: string, isDev: boolean) => void;
  onUninstall?: (packageName: string) => void;
  isLoading?: boolean;
  installedPackages?: Dependency[];
}

export const SearchPanel = memo(
  ({ results, onSearch, onInstall, onUninstall, isLoading, installedPackages }: SearchPanelProps) => {
    const t = useTranslation();
    const [query, setQuery] = useState('');
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [selectedPackage, setSelectedPackage] = useState<SearchResult | null>(null);
    const [isDev, setIsDev] = useState(false);
    const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSearchChange = (value: string) => {
      setQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // NPM search requires at least 2 characters
      if (value.trim().length >= 2) {
        debounceRef.current = setTimeout(() => {
          onSearch(value);
        }, 300);
      } else if (value.trim().length === 0) {
        // Clear results when search is empty
        onSearch('');
      }
    };

    const formatDownloads = (weekly?: number): string => {
      if (!weekly) return '-';
      if (weekly >= 1000000) return `${(weekly / 1000000).toFixed(1)}M`;
      if (weekly >= 1000) return `${(weekly / 1000).toFixed(1)}K`;
      return weekly.toString();
    };

    const formatDate = (dateStr: string): string => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    };

    // Crear un Set con los nombres de paquetes instalados para búsqueda rápida
    const installedPackageNames = useMemo(() => {
      return new Set(installedPackages?.map(dep => dep.name) ?? []);
    }, [installedPackages]);

    const isPackageInstalled = (packageName: string): boolean => {
      return installedPackageNames.has(packageName);
    };

    return (
      <div className="search-panel">
        <div
          className="search-header"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? t.tooltips.showAllPackages : t.tooltips.showOnlyUpdates}
        >
          <div className="search-header-left">
            <i className="codicon codicon-search" />
            <span>{t.search.title}</span>
          </div>
          <button
            className="search-toggle-btn"
            onClick={e => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            title={isCollapsed ? t.tooltips.showAllPackages : t.tooltips.showOnlyUpdates}
          >
            <i className={`codicon codicon-chevron-${isCollapsed ? 'up' : 'down'}`} />
          </button>
        </div>

        {!isCollapsed && (
          <>
            <div className="search-input-container">
              <i className="codicon codicon-search search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder={t.placeholders.searchNpm}
                value={query}
                onChange={e => handleSearchChange(e.target.value)}
              />
              {isLoading && <span className="search-loading">{t.states.searching}</span>}
            </div>

            {selectedPackage ? (
              <div className="install-confirmation">
                {isPackageInstalled(selectedPackage.name) ? (
                  <>
                    <h4>{interpolate(t.search.alreadyInstalled, { name: selectedPackage.name })}</h4>
                    <p className="install-description">{selectedPackage.description}</p>
                    {showUninstallConfirm ? (
                      <div className="uninstall-confirm">
                        <p className="uninstall-warning">
                          <i className="codicon codicon-warning" />
                          <span
                            dangerouslySetInnerHTML={{
                              __html: interpolate(t.modalMessages.confirmUninstall, { name: selectedPackage.name }),
                            }}
                          />
                        </p>
                        <div className="install-actions">
                          <button
                            className="search-uninstall-btn"
                            onClick={() => {
                              onUninstall?.(selectedPackage.name);
                              setShowUninstallConfirm(false);
                              setSelectedPackage(null);
                              setQuery('');
                            }}
                          >
                            <i className="codicon codicon-trash" /> {t.buttons.yesUninstall}
                          </button>
                          <button className="go-back-btn" onClick={() => setShowUninstallConfirm(false)}>
                            {t.buttons.cancel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="install-actions">
                        <button className="search-uninstall-btn" onClick={() => setShowUninstallConfirm(true)}>
                          <i className="codicon codicon-trash" /> {t.buttons.uninstall}
                        </button>
                        <button className="go-back-btn" onClick={() => setSelectedPackage(null)}>
                          {t.buttons.goBack}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h4>
                      {interpolate(t.search.confirmInstall, {
                        name: selectedPackage.name,
                        version: selectedPackage.version,
                      })}
                    </h4>
                    <p className="install-description">{selectedPackage.description}</p>
                    <div className="install-options">
                      <label className="dev-checkbox">
                        <input type="checkbox" checked={isDev} onChange={e => setIsDev(e.target.checked)} />
                        {t.search.installAsDev}
                      </label>
                    </div>
                    <div className="install-actions">
                      <button
                        className="install-btn"
                        onClick={() => {
                          onInstall(selectedPackage.name, selectedPackage.version, isDev);
                          setSelectedPackage(null);
                          setQuery('');
                        }}
                      >
                        {t.buttons.install}
                      </button>
                      <button className="cancel-btn" onClick={() => setSelectedPackage(null)}>
                        {t.buttons.cancel}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="search-results">
                {results.length === 0 && query && !isLoading && (
                  <div className="search-no-results">{interpolate(t.search.noResults, { query })}</div>
                )}
                {results.map(pkg => (
                  <div key={pkg.name} className="search-result-item" onClick={() => setSelectedPackage(pkg)}>
                    <div className="result-header">
                      <span className="result-name">{pkg.name}</span>
                      <span className="result-version">v{pkg.version}</span>
                      <span className="result-downloads">
                        <i className="codicon codicon-cloud-download" />
                        {interpolate(t.search.weeklyDownloads, { downloads: formatDownloads(pkg.downloads?.weekly) })}
                      </span>
                    </div>
                    <div className="result-description">{pkg.description}</div>
                    <div className="result-meta">
                      {pkg.keywords &&
                        pkg.keywords.slice(0, 3).map(kw => (
                          <span key={kw} className="result-keyword">
                            {kw}
                          </span>
                        ))}
                      <span className="result-date">
                        {interpolate(t.search.updated, { date: formatDate(pkg.date) })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);

SearchPanel.displayName = 'SearchPanel';
