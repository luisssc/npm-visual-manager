import { useState, useMemo } from 'react';
import { Dependency, SemverUpdateType } from '../types';
import './DependencyTable.css';

interface DependencyTableProps {
  dependencies: Dependency[];
  onUpdatePackage: (packageName: string, version: string, currentVersion?: string) => void;
  onUpdateAll: (packages: { name: string; version: string; currentVersion?: string }[]) => void;
  isLoading: boolean;
}

type SortColumn = 'name' | 'installedVersion' | 'latestVersion' | 'type' | 'size' | 'lastPublishDate' | 'hasVulnerabilities';
type SortDirection = 'asc' | 'desc';

const getSemverColor = (type: SemverUpdateType | undefined): string => {
  switch (type) {
    case 'major': return 'var(--vscode-errorForeground, #f44336)';
    case 'minor': return 'var(--vscode-warningForeground, #ff9800)';
    case 'patch': return 'var(--vscode-testing-iconPassed, #4caf50)';
    default: return 'var(--vscode-descriptionForeground, #888)';
  }
};

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
  isLoading
}: DependencyTableProps) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Dependency['type']>('all');
  const [updatingPackages, setUpdatingPackages] = useState<Set<string>>(new Set());

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
    onUpdatePackage(dep.name, 'latest', dep.installedVersion);
    setTimeout(() => {
      setUpdatingPackages(prev => {
        const next = new Set(prev);
        next.delete(dep.name);
        return next;
      });
    }, 3000);
  };

  const handleUpdateAll = () => {
    const packagesToUpdate = sortedAndFilteredDeps
      .filter(d => d.updateAvailable && d.latestVersion)
      .map(d => ({ name: d.name, version: 'latest' }));
    onUpdateAll(packagesToUpdate);
  };

  const sortedAndFilteredDeps = useMemo(() => {
    let result = [...dependencies];

    // Filter by type
    if (typeFilter !== 'all') {
      result = result.filter(d => d.type === typeFilter);
    }

    // Filter by search text
    if (filter.trim()) {
      const filterLower = filter.toLowerCase();
      result = result.filter(d => 
        d.name.toLowerCase().includes(filterLower) ||
        d.installedVersion.toLowerCase().includes(filterLower)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'installedVersion':
          comparison = a.installedVersion.localeCompare(b.installedVersion);
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
        case 'hasVulnerabilities':
          comparison = (a.hasVulnerabilities ? 1 : 0) - (b.hasVulnerabilities ? 1 : 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [dependencies, sortColumn, sortDirection, filter, typeFilter]);

  const updateCount = dependencies.filter(d => d.updateAvailable).length;

  const getSortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) {return '⇅';}
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const getTypeLabel = (type: Dependency['type']) => {
    switch (type) {
      case 'dependencies': return 'Prod';
      case 'devDependencies': return 'Dev';
      case 'peerDependencies': return 'Peer';
      default: return type;
    }
  };

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
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="type-filter"
          >
            <option value="all">All Types</option>
            <option value="dependencies">Production</option>
            <option value="devDependencies">Development</option>
            <option value="peerDependencies">Peer</option>
          </select>
        </div>
        {updateCount > 0 && (
          <button 
            className="update-all-btn"
            onClick={handleUpdateAll}
            disabled={isLoading}
          >
            Update All ({updateCount})
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table className="dependency-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('name')} className="sortable">
                Package {getSortIndicator('name')}
              </th>
              <th onClick={() => handleSort('type')} className="sortable type-col">
                Type {getSortIndicator('type')}
              </th>
              <th onClick={() => handleSort('installedVersion')} className="sortable version-col">
                Installed {getSortIndicator('installedVersion')}
              </th>
              <th onClick={() => handleSort('latestVersion')} className="sortable version-col">
                Latest {getSortIndicator('latestVersion')}
              </th>
              <th onClick={() => handleSort('size')} className="sortable size-col">
                Size {getSortIndicator('size')}
              </th>
              <th className="sortable update-type-col">
                Update
              </th>
              <th onClick={() => handleSort('lastPublishDate')} className="sortable date-col">
                Last Update {getSortIndicator('lastPublishDate')}
              </th>
              <th className="sortable security-col">
                Security
              </th>
              <th className="action-col">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedAndFilteredDeps.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  {dependencies.length === 0 
                    ? 'No dependencies found in package.json'
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
                  <td className="package-name">
                    <span className="name">{dep.name}</span>
                  </td>
                  <td className="type-cell">
                    <span className={`type-badge type-${dep.type}`}>
                      {getTypeLabel(dep.type)}
                    </span>
                  </td>
                  <td className="version-cell">
                    <code>{dep.installedVersion}</code>
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
                  <td className="size-cell">
                    <span className="size-text">{dep.size || '-'}</span>
                  </td>
                  <td className="update-type-cell">
                    {dep.updateAvailable && dep.semverUpdateType && dep.semverUpdateType !== 'none' && (
                      <span 
                        className="semver-badge"
                        style={{ 
                          backgroundColor: getSemverColor(dep.semverUpdateType),
                          color: '#fff'
                        }}
                        title={`${getSemverLabel(dep.semverUpdateType)} update available`}
                      >
                        {getSemverLabel(dep.semverUpdateType)}
                      </span>
                    )}
                  </td>
                  <td className="date-cell">
                    {dep.lastPublishDate ? (
                      <span className="date-text" title={new Date(dep.lastPublishDate).toLocaleDateString()}>
                        {formatDate(dep.lastPublishDate)}
                      </span>
                    ) : (
                      <span className="checking">-</span>
                    )}
                  </td>
                  <td className="security-cell">
                    {dep.hasVulnerabilities ? (
                      <span className="security-badge security-danger" title={`${dep.vulnerabilityCount || 1} vulnerabilities found`}>
                        ⚠ {dep.vulnerabilityCount || 1}
                      </span>
                    ) : (
                      <span className="security-badge security-safe">✓</span>
                    )}
                  </td>
                  <td className="action-cell">
                    {dep.updateAvailable && dep.latestVersion ? (
                      <button
                        className="update-btn"
                        onClick={() => handleUpdate(dep)}
                        disabled={updatingPackages.has(dep.name) || isLoading}
                      >
                        {updatingPackages.has(dep.name) ? '...' : 'Update'}
                      </button>
                    ) : (
                      <span className="up-to-date">✓</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="footer">
        <span>Showing {sortedAndFilteredDeps.length} of {dependencies.length} packages</span>
        {updateCount > 0 && (
          <span className="update-summary">
            {updateCount} update{updateCount !== 1 ? 's' : ''} available
          </span>
        )}
      </div>
    </div>
  );
};
