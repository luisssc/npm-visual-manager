import { useState, useMemo, ReactNode } from 'react';
import { Dependency, SemverUpdateType, ColumnConfig, UpdateHistory } from '../types';
import './DependencyTable.css';

const Tooltip = ({ text, children }: { text: string; children: ReactNode }) => (
  <span className="tooltip-wrapper">
    {children}
    <span className="tooltip">{text}</span>
  </span>
);

interface DependencyTableProps {
  dependencies: Dependency[];
  onUpdatePackage: (packageName: string, version: string, currentVersion?: string) => void;
  onUpdateAll: (packages: { name: string; version: string; currentVersion?: string }[]) => void;
  isLoading: boolean;
  columnConfig: ColumnConfig;
  showAllPackages: boolean;
  nodeVersion?: string;
  packageManager?: string;
  packageManagerVersion?: string;
  lastUpdate?: UpdateHistory | null;
  onRollback?: () => void;
  rollbackMessage?: string | null;
  onToggleIgnore?: (packageName: string, currentVersion?: string) => void;
}

type SortColumn = 'name' | 'installedVersion' | 'latestVersion' | 'type' | 'size' | 'lastPublishDate';
type SortDirection = 'asc' | 'desc';

const getSemverLabel = (type: SemverUpdateType | undefined): string => {
  switch (type) {
    case 'major': return 'MAJOR';
    case 'minor': return 'MINOR';
    case 'patch': return 'PATCH';
    default: return '';
  }
};

const formatDate = (dateString: string | undefined): string => {
  if (!dateString) {return '-';}
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  } else if (diffDays < 365) {
    return `${Math.floor(diffDays / 30)}mo ago`;
  } else {
    return `${Math.floor(diffDays / 365)}y ago`;
  }
};

export const DependencyTable = ({
  dependencies,
  onUpdatePackage,
  onUpdateAll,
  isLoading,
  columnConfig,
  showAllPackages,
  nodeVersion,
  packageManager,
  packageManagerVersion,
  lastUpdate,
  onRollback,
  rollbackMessage,
  onToggleIgnore
}: DependencyTableProps) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filter, setFilter] = useState('');
  const [updatingPackages, setUpdatingPackages] = useState<Set<string>>(new Set());
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleUpdate = (dep: Dependency) => {
    if (!dep.latestVersion) {return;}
    setUpdatingPackages(prev => new Set(prev).add(dep.name));
    onUpdatePackage(dep.name, 'latest', dep.declaredVersion);
    setTimeout(() => {
      setUpdatingPackages(prev => {
        const next = new Set(prev);
        next.delete(dep.name);
        return next;
      });
    }, 3000);
  };

  const handleSelectPackage = (packageName: string, checked: boolean) => {
    setSelectedPackages(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(packageName);
      } else {
        next.delete(packageName);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Only select packages with updates (excluding ignored)
      const updatable = sortedAndFilteredDeps
        .filter(d => d.updateAvailable && !d.isIgnored)
        .map(d => d.name);
      setSelectedPackages(new Set(updatable));
    } else {
      setSelectedPackages(new Set());
    }
  };

  const handleUpdateSelected = () => {
    const packagesToUpdate = sortedAndFilteredDeps
      .filter(d => selectedPackages.has(d.name) && d.updateAvailable && !d.isIgnored && d.latestVersion)
      .map(d => ({ name: d.name, version: 'latest', currentVersion: d.declaredVersion }));
    
    if (packagesToUpdate.length > 0) {
      onUpdateAll(packagesToUpdate);
      setSelectedPackages(new Set()); // Clear selection after update
    }
  };

  const handleUpdateAll = () => {
    const packagesToUpdate = sortedAndFilteredDeps
      .filter(d => d.updateAvailable && !d.isIgnored && d.latestVersion)
      .map(d => ({ name: d.name, version: 'latest', currentVersion: d.declaredVersion }));
    onUpdateAll(packagesToUpdate);
  };

  const sortedAndFilteredDeps = useMemo(() => {
    let result = [...dependencies];

    // Filter by update availability (unless showing all)
    if (!showAllPackages) {
      result = result.filter(d => d.updateAvailable);
    }

    // Filter by search text
    if (filter.trim()) {
      const filterLower = filter.toLowerCase();
      result = result.filter(d => 
        d.name.toLowerCase().includes(filterLower) ||
        d.declaredVersion.toLowerCase().includes(filterLower)
      );
    }

    // Sort
    result.sort((a, b) => {
      // If showing all packages, always show updates at the top
      if (showAllPackages) {
        const aUpdate = a.updateAvailable ? 1 : 0;
        const bUpdate = b.updateAvailable ? 1 : 0;
        if (aUpdate !== bUpdate) {
          return bUpdate - aUpdate; // Updates (1) before no-updates (0)
        }
      }

      let comparison = 0;
      switch (sortColumn) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'installedVersion':
          comparison = a.declaredVersion.localeCompare(b.declaredVersion);
          break;
        case 'latestVersion':
          comparison = (a.latestVersion || '').localeCompare(b.latestVersion || '');
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'size':
          comparison = (a.size || '').localeCompare(b.size || '');
          break;
        case 'lastPublishDate':
          comparison = (a.lastPublishDate || '').localeCompare(b.lastPublishDate || '');
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [dependencies, sortColumn, sortDirection, filter, showAllPackages]);

  const updateCount = dependencies.filter(d => d.updateAvailable && !d.isIgnored).length;

  const getSortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) {return <i className="codicon codicon-arrow-swap" />;}
    return sortDirection === 'asc'
      ? <i className="codicon codicon-arrow-up" />
      : <i className="codicon codicon-arrow-down" />;
  };

  // Calculate colspan for empty state
  const visibleColumnCount = 5 + // Always visible: Checkbox, Package, Installed, Latest, Action
    (columnConfig.type ? 1 : 0) +
    (columnConfig.size ? 1 : 0) +
    (columnConfig.semverUpdate ? 1 : 0) +
    (columnConfig.lastUpdate ? 1 : 0);

  return (
    <div className="dependency-table-container">
      <div className="toolbar">
        <div className="filters">
          <input
            type="text"
            placeholder="Filter packages..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-input"
          />
          {(nodeVersion || packageManager) && (
            <div className="env-info">
              {nodeVersion && (
                <span className="env-badge node-badge" title={`Node.js v${nodeVersion}`}>
                  ⬢ v{nodeVersion}
                </span>
              )}
              {packageManager && (
                <span className={`env-badge pm-badge pm-${packageManager}`}>
                  {packageManager}
                  {packageManagerVersion && <span className="pm-version">v{packageManagerVersion}</span>}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="toolbar-actions">
          {lastUpdate && onRollback && (
            <button 
              className="rollback-btn"
              onClick={onRollback}
              disabled={isLoading}
              title={`Rollback last update (${lastUpdate.packages.length} package${lastUpdate.packages.length > 1 ? 's' : ''})`}
            >
              <span>↩</span> Rollback
            </button>
          )}
          {selectedPackages.size > 0 ? (
            <button 
              className="update-selected-btn"
              onClick={handleUpdateSelected}
              disabled={isLoading}
            >
              Update Selected ({selectedPackages.size})
            </button>
          ) : updateCount > 0 && (
            <button 
              className="update-all-btn"
              onClick={handleUpdateAll}
              disabled={isLoading}
            >
              Update All ({updateCount})
            </button>
          )}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="dependency-table">
          <thead>
            <tr>
              <th className="checkbox-col">
                <input
                  type="checkbox"
                  checked={selectedPackages.size > 0 && selectedPackages.size === sortedAndFilteredDeps.filter(d => d.updateAvailable && !d.isIgnored).length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  title="Select all packages with updates"
                />
              </th>
              <th onClick={() => handleSort('name')} className="sortable package-col">
                Package {getSortIndicator('name')}
              </th>
              {columnConfig.type && (
                <th onClick={() => handleSort('type')} className="sortable type-col">
                  Type {getSortIndicator('type')}
                </th>
              )}
              <th onClick={() => handleSort('installedVersion')} className="sortable version-col">
                Installed {getSortIndicator('installedVersion')}
              </th>
              <th onClick={() => handleSort('latestVersion')} className="sortable version-col">
                Latest {getSortIndicator('latestVersion')}
              </th>
              {columnConfig.size && (
                <th onClick={() => handleSort('size')} className="sortable size-col">
                  Size {getSortIndicator('size')}
                </th>
              )}
              {columnConfig.semverUpdate && (
                <th className="sortable update-type-col">
                  Update
                </th>
              )}
              {columnConfig.lastUpdate && (
                <th onClick={() => handleSort('lastPublishDate')} className="sortable date-col">
                  Last Update {getSortIndicator('lastPublishDate')}
                </th>
              )}

              <th className="action-col">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedAndFilteredDeps.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="empty-state">
                  {dependencies.length === 0 
                    ? 'No dependencies found in package.json'
                    : !showAllPackages 
                      ? 'All packages are up to date! Click "Show All Packages" to see everything.'
                      : 'No packages match the current filter'
                  }
                </td>
              </tr>
            ) : (
              sortedAndFilteredDeps.map((dep) => (
                <tr 
                  key={dep.name} 
                  className={dep.updateAvailable ? 'has-update' : ''}
                >
                  <td className="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={selectedPackages.has(dep.name)}
                      onChange={(e) => handleSelectPackage(dep.name, e.target.checked)}
                      disabled={!dep.updateAvailable}
                      title={dep.updateAvailable ? 'Select for update' : 'No update available'}
                    />
                  </td>
                  <td className="package-name">
                    <div className="package-info">
                      <Tooltip text="View on npm">
                        <a
                          href={`https://www.npmjs.com/package/${dep.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="package-link"
                        >
                          {dep.name}
                        </a>
                      </Tooltip>
                      {dep.isDeprecated && (
                        <Tooltip text="Deprecated">
                          <span className="status-badge status-deprecated">
                            <i className="codicon codicon-error" />
                          </span>
                        </Tooltip>
                      )}
                      {dep.hasVulnerabilities ? (
                        <Tooltip text={`${dep.vulnerabilityCount || 1} vulnerabilities found`}>
                          <span className="status-badge status-danger">
                            <i className="codicon codicon-warning" /> {dep.vulnerabilityCount || 1}
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="status-badge status-safe"><i className="codicon codicon-shield" /></span>
                      )}
                    </div>
                  </td>
                  {columnConfig.type && (
                    <td className="type-cell">
                      <span className={`type-badge type-${dep.type}`}>
                        {dep.type === 'dependencies' ? 'Prod' : dep.type === 'devDependencies' ? 'Dev' : 'Peer'}
                      </span>
                    </td>
                  )}
                  <td className="version-cell">
                    <code>{dep.declaredVersion}</code>
                  </td>
                  <td className="version-cell">
                    {dep.latestVersion ? (
                      <code className={dep.updateAvailable ? 'latest-version' : ''}>
                        {dep.latestVersion}
                      </code>
                    ) : (
                      <span className="checking">checking...</span>
                    )}
                  </td>
                  {columnConfig.size && (
                    <td className="size-cell">
                      <span className="size-text">{dep.size || '-'}</span>
                    </td>
                  )}
                  {columnConfig.semverUpdate && (
                    <td className="update-type-cell">
                      {dep.updateAvailable && dep.semverUpdateType && dep.semverUpdateType !== 'none' && (
                        <Tooltip text={`${getSemverLabel(dep.semverUpdateType)} update available`}>
                          <span
                            className={`semver-badge semver-${dep.semverUpdateType}`}
                          >
                            {getSemverLabel(dep.semverUpdateType)}
                          </span>
                        </Tooltip>
                      )}
                    </td>
                  )}
                  {columnConfig.lastUpdate && (
                    <td className="date-cell">
                      {dep.lastPublishDate ? (
                        <Tooltip text={new Date(dep.lastPublishDate).toLocaleDateString('en-GB')}>
                          <span className="date-text">
                            {formatDate(dep.lastPublishDate)}
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="checking">-</span>
                      )}
                    </td>
                  )}

                  <td className="action-cell">
                    <div className="action-buttons">
                      {dep.isIgnored ? (
                        <Tooltip text={dep.ignoreReason || 'Ignored'}>
                          <button
                            className="pin-btn pinned"
                            onClick={() => onToggleIgnore?.(dep.name, dep.installedVersion)}
                            disabled={isLoading}
                            title="Unignore package"
                          >
                            <i className="codicon codicon-eye-closed" />
                          </button>
                        </Tooltip>
                      ) : dep.updateAvailable && dep.latestVersion ? (
                        <button
                          className="update-btn"
                          onClick={() => handleUpdate(dep)}
                          disabled={updatingPackages.has(dep.name) || isLoading}
                        >
                          {updatingPackages.has(dep.name) ? '...' : 'Update'}
                        </button>
                      ) : (
                        <span className="up-to-date"><i className="codicon codicon-check" /></span>
                      )}
                      {!dep.isIgnored && (
                        <button
                          className="ignore-btn"
                          onClick={() => onToggleIgnore?.(dep.name, dep.installedVersion)}
                          disabled={isLoading}
                          title="Ignore this package"
                        >
                          <i className="codicon codicon-eye-closed" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="footer">
        <span>Showing {sortedAndFilteredDeps.length} of {dependencies.length} packages</span>
        {rollbackMessage && (
          <span className="rollback-message">
            <i className="codicon codicon-history" /> {rollbackMessage}
          </span>
        )}
        {updateCount > 0 && (
          <span className="update-summary">
            {updateCount} update{updateCount !== 1 ? 's' : ''} available
          </span>
        )}
      </div>
    </div>
  );
};
