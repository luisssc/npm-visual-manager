import { useState, useCallback, useRef } from 'react';
import { SearchResult } from '../types';
import './SearchPanel.css';

interface SearchPanelProps {
  results: SearchResult[];
  onSearch: (query: string) => void;
  onInstall: (packageName: string, version: string, isDev: boolean) => void;
  isLoading?: boolean;
}

export const SearchPanel = ({ results, onSearch, onInstall, isLoading }: SearchPanelProps) => {
  const [query, setQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<SearchResult | null>(null);
  const [isDev, setIsDev] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setQuery(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        onSearch(value);
      }, 300);
    }
  }, [onSearch]);

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

  return (
    <div className="search-panel">
      <div className="search-header">
        <div className="search-header-left">
          <i className="codicon codicon-search" />
          <span>Install Packages</span>
        </div>
        <button
          className="search-toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Show search' : 'Hide search'}
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
              placeholder="Search npm packages..."
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              disabled={isLoading}
            />
            {isLoading && <span className="search-loading">Searching...</span>}
          </div>

          {selectedPackage ? (
            <div className="install-confirmation">
              <h4>Install {selectedPackage.name}@{selectedPackage.version}?</h4>
              <p className="install-description">{selectedPackage.description}</p>
              <div className="install-options">
                <label className="dev-checkbox">
                  <input
                    type="checkbox"
                    checked={isDev}
                    onChange={(e) => setIsDev(e.target.checked)}
                  />
                  Install as dev dependency
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
                  Install
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => setSelectedPackage(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="search-results">
              {results.length === 0 && query && !isLoading && (
                <div className="search-no-results">No packages found for &quot;{query}&quot;</div>
              )}
              {results.map((pkg) => (
                <div
                  key={pkg.name}
                  className="search-result-item"
                  onClick={() => setSelectedPackage(pkg)}
                >
                  <div className="result-header">
                    <span className="result-name">{pkg.name}</span>
                    <span className="result-version">v{pkg.version}</span>
                    <span className="result-downloads">
                      <i className="codicon codicon-cloud-download" />
                      {formatDownloads(pkg.downloads?.weekly)}/wk
                    </span>
                  </div>
                  <div className="result-description">{pkg.description}</div>
                  <div className="result-meta">
                    {pkg.keywords && pkg.keywords.slice(0, 3).map((kw) => (
                      <span key={kw} className="result-keyword">{kw}</span>
                    ))}
                    <span className="result-date">Updated {formatDate(pkg.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
