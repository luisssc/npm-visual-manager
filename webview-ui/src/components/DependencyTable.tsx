import { useState, useMemo, ReactNode, useEffect } from 'react';
import type { Dependency, SemverUpdateType, ColumnConfig, UpdateHistory, PackageVersion } from '../../../types';
import './DependencyTable.css';
import { useTranslation, interpolate } from '../i18n/I18nContext';

const Tooltip = ({ text, children }: { text: string; children: ReactNode }) => (
  <span className="tooltip-wrapper">
    {children}
    <span className="tooltip">{text}</span>
  </span>
);

// Component for collapsible prerelease versions section
interface PrereleaseSectionProps {
  versions: PackageVersion[];
  selectedVersion: string;
  onSelect: (version: string) => void;
  formatDate: (date: string) => string;
}

const PrereleaseSection = ({ versions, selectedVersion, onSelect, formatDate }: PrereleaseSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = useTranslation();
  
  // Show only first 3 by default, or all if expanded
  const displayedVersions = isExpanded ? versions : versions.slice(0, 3);
  
  return (
    <>
      <div className="version-separator prerelease-separator">
        <span>Pre-release versions ({versions.length})</span>
      </div>
      {displayedVersions.map(v => (
        <div
          key={v.version}
          className={`version-item prerelease-item ${v.version === selectedVersion ? 'selected' : ''} ${v.isDeprecated ? 'deprecated' : ''}`}
          onClick={() => onSelect(v.version)}
        >
          <div className="version-radio">
            <input
              type="radio"
              name="version"
              value={v.version}
              checked={v.version === selectedVersion}
              onChange={() => onSelect(v.version)}
            />
          </div>
          <div className="version-info">
            <span className="version-number">
              {v.version}
              <span className="prerelease-badge">{t.labels.prerelease || 'pre-release'}</span>
              {v.isDeprecated && (
                <span className="deprecated-badge">{t.labels.deprecated || 'deprecated'}</span>
              )}
            </span>
            <span className="version-date">{formatDate(v.date)}</span>
          </div>
        </div>
      ))}
      {versions.length > 3 && (
        <button 
          className="show-more-versions"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded 
            ? (t.buttons.showLess || 'Show less') 
            : interpolate(t.buttons.showMore || 'Show {{count}} more', { count: versions.length - 3 })}
        </button>
      )}
    </>
  );
};

interface DependencyTableProps {
  dependencies: Dependency[];
  onUpdatePackage: (packageName: string, version: string, currentVersion?: string, useExactVersion?: boolean) => void;
  onUpdateAll: (packages: { name: string; version: string; currentVersion?: string; useExactVersion?: boolean }[]) => void;
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
  onOpenExternal?: (url: string) => void;
  onUninstall?: (packageName: string) => void;
  onGetPackageVersions?: (packageName: string) => void;
  getVersionsForPackage?: (packageName: string) => PackageVersion[];
  isLoadingVersions?: (packageName: string) => boolean;
  saveExact?: boolean;
  onWhyInstalled?: (packageName: string) => void;
  whyResult?: { packageName: string; chains: string[][]; unsupported?: boolean; notInstalled?: boolean; error?: string } | null;
  whyLoadingPackage?: string | null;
  onCloseWhy?: () => void;
}

type SortColumn = 'name' | 'installedVersion' | 'latestVersion' | 'type' | 'size' | 'lastPublishDate';
type SortDirection = 'asc' | 'desc';

const getSemverLabel = (
  t: { semver: { major: string; minor: string; patch: string } },
  type: SemverUpdateType | undefined
): string => {
  switch (type) {
    case 'major':
      return t.semver.major;
    case 'minor':
      return t.semver.minor;
    case 'patch':
      return t.semver.patch;
    default:
      return '';
  }
};

const parseSize = (sizeStr: string | undefined): number => {
  if (!sizeStr || sizeStr === '-') {
    return 0;
  }
  const parts = sizeStr.split(' ');
  if (parts.length !== 2) {
    return 0;
  }
  const value = parseFloat(parts[0]!);
  if (Number.isNaN(value)) {
    return 0;
  }
  const unit = parts[1]!.toUpperCase();
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = units.indexOf(unit);
  if (index === -1) {
    return 0;
  }
  return value * Math.pow(1024, index);
};

const formatDate = (
  t: {
    timeAgo: {
      days: string;
      days_singular: string;
      months: string;
      months_singular: string;
      years: string;
      years_singular: string;
    };
  },
  dateString: string | undefined
): string => {
  if (!dateString) {
    return '-';
  }
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 30) {
    const key = diffDays === 1 ? 'days_singular' : 'days';
    return interpolate(t.timeAgo[key], { count: diffDays });
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    const key = months === 1 ? 'months_singular' : 'months';
    return interpolate(t.timeAgo[key], { count: months });
  } else {
    const years = Math.floor(diffDays / 365);
    const key = years === 1 ? 'years_singular' : 'years';
    return interpolate(t.timeAgo[key], { count: years });
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
  onToggleIgnore,
  onOpenExternal,
  onUninstall,
  onGetPackageVersions,
  getVersionsForPackage,
  isLoadingVersions,
  saveExact,
  onWhyInstalled,
  whyResult,
  whyLoadingPackage,
  onCloseWhy,
}: DependencyTableProps) => {
  const t = useTranslation();
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filter, setFilter] = useState('');
  const [updatingPackages, setUpdatingPackages] = useState<Set<string>>(new Set());
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [showIgnored, setShowIgnored] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [confirmUpdateAll, setConfirmUpdateAll] = useState<Dependency[] | null>(null);
  const [confirmUpdateSelected, setConfirmUpdateSelected] = useState<Dependency[] | null>(null);
  const [confirmIgnore, setConfirmIgnore] = useState<{ name: string; isIgnored: boolean } | null>(null);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [versionPickerOpen, setVersionPickerOpen] = useState<Dependency | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [useExactVersion, setUseExactVersion] = useState<boolean>(false);
  const [vulnerabilityModalPackage, setVulnerabilityModalPackage] = useState<string | null>(null);
  // Note: confirmUpdate was replaced by versionPickerOpen for exact version selection

  // Clear selection for packages that are no longer in the dependencies list (e.g. after uninstall)
  useEffect(() => {
    setSelectedPackages(prev => {
      let changed = false;
      const next = new Set<string>();
      for (const p of prev) {
        if (dependencies.some(d => d.name === p)) {
          next.add(p);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dependencies]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleUpdate = (dep: Dependency) => {
    if (!dep.latestVersion) {
      return;
    }
    // Open version picker instead of simple confirmation
    setVersionPickerOpen(dep);
    setSelectedVersion(dep.latestVersion || '');
    setUseExactVersion(saveExact || false); // Default from settings, but user can override
    onGetPackageVersions?.(dep.name);
  };

  const handleVersionSelect = (version: string) => {
    setSelectedVersion(version);
  };

  const confirmVersionUpdate = () => {
    if (!versionPickerOpen || !selectedVersion) {
      return;
    }
    setUpdatingPackages(prev => new Set(prev).add(versionPickerOpen.name));
    // Pass useExactVersion flag from the checkbox
    onUpdatePackage(versionPickerOpen.name, selectedVersion, versionPickerOpen.declaredVersion, useExactVersion);
    setVersionPickerOpen(null);
    setTimeout(() => {
      setUpdatingPackages(prev => {
        const next = new Set(prev);
        next.delete(versionPickerOpen.name);
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
      const updatable = sortedAndFilteredDeps.filter(d => d.updateAvailable && !d.isIgnored).map(d => d.name);
      setSelectedPackages(new Set(updatable));
    } else {
      setSelectedPackages(new Set());
    }
  };

  const handleUpdateSelected = () => {
    const packagesToUpdate = sortedAndFilteredDeps.filter(
      d => selectedPackages.has(d.name) && d.updateAvailable && !d.isIgnored && d.latestVersion
    );

    if (packagesToUpdate.length > 0) {
      setConfirmUpdateSelected(packagesToUpdate);
    }
  };

  const confirmUpdateSelectedPackages = () => {
    if (!confirmUpdateSelected) {
      return;
    }
    const packages = confirmUpdateSelected.map(d => ({
      name: d.name,
      version: 'latest',
      currentVersion: d.declaredVersion,
    }));
    onUpdateAll(packages);
    setSelectedPackages(new Set()); // Clear selection after update
    setConfirmUpdateSelected(null);
  };

  const handleUpdateAll = () => {
    const packagesToUpdate = sortedAndFilteredDeps.filter(d => d.updateAvailable && !d.isIgnored && d.latestVersion);

    if (packagesToUpdate.length > 0) {
      setConfirmUpdateAll(packagesToUpdate);
    }
  };

  const confirmUpdateAllPackages = () => {
    if (!confirmUpdateAll) {
      return;
    }
    const packages = confirmUpdateAll.map(d => ({
      name: d.name,
      version: 'latest',
      currentVersion: d.declaredVersion,
    }));
    onUpdateAll(packages);
    setConfirmUpdateAll(null);
  };

  const { sortedAndFilteredDeps, ignoredDeps } = useMemo(() => {
    const sortDepsInternal = (result: Dependency[]) => {
      return result.sort((a, b) => {
        // If showing all packages, always show updates at the top
        if (showAllPackages) {
          const aUpdate = a.updateAvailable ? 1 : 0;
          const bUpdate = b.updateAvailable ? 1 : 0;
          if (aUpdate !== bUpdate) {
            return bUpdate - aUpdate;
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
            comparison = parseSize(a.size) - parseSize(b.size);
            break;
          case 'lastPublishDate':
            comparison = (a.lastPublishDate || '').localeCompare(b.lastPublishDate || '');
            break;
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    };

    let result = [...dependencies];

    // Filter by update availability (unless showing all)
    if (!showAllPackages) {
      result = result.filter(d => d.updateAvailable);
    }

    // Filter by search text
    if (filter.trim()) {
      const filterLower = filter.toLowerCase();
      result = result.filter(
        d => d.name.toLowerCase().includes(filterLower) || d.declaredVersion.toLowerCase().includes(filterLower)
      );
    }

    // Separate ignored from active
    const active = result.filter(d => !d.isIgnored);
    const ignored = result.filter(d => d.isIgnored);

    return {
      sortedAndFilteredDeps: sortDepsInternal(active),
      ignoredDeps: sortDepsInternal(ignored),
    };
  }, [dependencies, sortColumn, sortDirection, filter, showAllPackages]);

  const updateCount = dependencies.filter(d => d.updateAvailable && !d.isIgnored).length;

  const getSortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <i className="codicon codicon-arrow-swap" />;
    }
    return sortDirection === 'asc' ? (
      <i className="codicon codicon-arrow-up" />
    ) : (
      <i className="codicon codicon-arrow-down" />
    );
  };

  // Calculate colspan for empty state
  const visibleColumnCount =
    5 + // Always visible: Checkbox, Package, Installed, Latest, Action
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
            placeholder={t.placeholders.filterPackages}
            value={filter}
            onChange={e => setFilter(e.target.value)}
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
              onClick={() => setConfirmRollback(true)}
              disabled={isLoading}
              title={interpolate(
                lastUpdate.packages.length === 1 ? t.tooltips.rollbackUpdate : t.tooltips.rollbackUpdate_plural,
                { count: lastUpdate.packages.length }
              )}
            >
              <span>↩</span> {t.buttons.rollback}
            </button>
          )}
          {selectedPackages.size > 0 ? (
            <button className="update-selected-btn" onClick={handleUpdateSelected} disabled={isLoading}>
              {interpolate(t.buttons.updateSelected, {})} ({selectedPackages.size})
            </button>
          ) : (
            updateCount > 0 && (
              <button className="update-all-btn" onClick={handleUpdateAll} disabled={isLoading}>
                {t.buttons.updateAll} ({updateCount})
              </button>
            )
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
                  checked={
                    selectedPackages.size > 0 &&
                    selectedPackages.size ===
                      sortedAndFilteredDeps.filter(d => d.updateAvailable && !d.isIgnored).length
                  }
                  onChange={e => handleSelectAll(e.target.checked)}
                  title={t.tooltips.selectAllUpdates}
                />
              </th>
              <th onClick={() => handleSort('name')} className="sortable package-col">
                {t.columns.package} {getSortIndicator('name')}
              </th>
              {columnConfig.type && (
                <th onClick={() => handleSort('type')} className="sortable type-col">
                  {t.columns.type} {getSortIndicator('type')}
                </th>
              )}
              <th onClick={() => handleSort('installedVersion')} className="sortable version-col">
                {t.columns.installed} {getSortIndicator('installedVersion')}
              </th>
              <th onClick={() => handleSort('latestVersion')} className="sortable version-col">
                {t.columns.latest} {getSortIndicator('latestVersion')}
              </th>
              {columnConfig.size && (
                <th onClick={() => handleSort('size')} className="sortable size-col">
                  {t.columns.size} {getSortIndicator('size')}
                </th>
              )}
              {columnConfig.semverUpdate && <th className="sortable update-type-col">{t.columns.update}</th>}
              {columnConfig.lastUpdate && (
                <th onClick={() => handleSort('lastPublishDate')} className="sortable date-col">
                  {t.columns.lastUpdate} {getSortIndicator('lastPublishDate')}
                </th>
              )}

              <th className="action-col">{t.columns.action}</th>
            </tr>
          </thead>
          <tbody>
            {sortedAndFilteredDeps.length === 0 && ignoredDeps.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="empty-state">
                  {dependencies.length === 0
                    ? t.states.noDependencies
                    : !showAllPackages
                      ? t.states.allUpToDate
                      : t.states.noMatchFilter}
                </td>
              </tr>
            ) : (
              <>
                {sortedAndFilteredDeps.map(dep => (
                  <tr key={dep.name} className={dep.updateAvailable ? 'has-update' : ''}>
                    <td className="checkbox-cell">
                      <input
                        type="checkbox"
                        checked={selectedPackages.has(dep.name)}
                        onChange={e => handleSelectPackage(dep.name, e.target.checked)}
                        disabled={!dep.updateAvailable}
                        title={dep.updateAvailable ? t.tooltips.selectForUpdate : t.tooltips.noUpdateAvailable}
                      />
                    </td>
                    <td className="package-name">
                      <div className="package-info">
                        <Tooltip text={t.tooltips.viewOnNpm}>
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
                          <Tooltip text={t.tooltips.deprecated}>
                            <span className="status-badge status-deprecated">
                              <i className="codicon codicon-error" />
                            </span>
                          </Tooltip>
                        )}
                        {dep.hasVulnerabilities ? (
                          <Tooltip
                            text={interpolate(t.tooltips.vulnerabilities, { count: dep.vulnerabilityCount || 1 })}
                          >
                            <button
                              className="status-badge status-danger vulnerability-btn"
                              onClick={() => setVulnerabilityModalPackage(dep.name)}
                              title="View vulnerability details"
                            >
                              <i className="codicon codicon-warning" /> {dep.vulnerabilityCount || 1}
                            </button>
                          </Tooltip>
                        ) : (
                          <Tooltip text={t.tooltips.noSecurityIssues}>
                            <span className="status-badge status-safe">
                              <i className="codicon codicon-shield" />
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    {columnConfig.type && (
                      <td className="type-cell">
                        <span className={`type-badge type-${dep.type}`}>
                          {dep.type === 'dependencies'
                            ? t.dependencyTypes.prod
                            : dep.type === 'devDependencies'
                              ? t.dependencyTypes.dev
                              : t.dependencyTypes.peer}
                        </span>
                      </td>
                    )}
                    <td className="version-cell">
                      <code title={dep.declaredVersion}>{dep.declaredVersion}</code>
                      {dep.declaredVersion !== dep.installedVersion && (
                        <Tooltip text={`${t.columns.installed}: ${dep.installedVersion}`}>
                          <span className="version-mismatch-icon">*</span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="version-cell">
                      {dep.latestVersion ? (
                        <code className={dep.updateAvailable ? 'latest-version' : ''}>{dep.latestVersion}</code>
                      ) : dep.checkError ? (
                        <Tooltip text={dep.checkError}>
                          <span className="not-available">-</span>
                        </Tooltip>
                      ) : (
                        <span className="checking">{t.states.checking}</span>
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
                          <Tooltip text={`${getSemverLabel(t, dep.semverUpdateType)} update available`}>
                            <span className={`semver-badge semver-${dep.semverUpdateType}`}>
                              {getSemverLabel(t, dep.semverUpdateType)}
                            </span>
                          </Tooltip>
                        )}
                      </td>
                    )}
                    {columnConfig.lastUpdate && (
                      <td className="date-cell">
                        {dep.lastPublishDate ? (
                          <Tooltip text={new Date(dep.lastPublishDate).toLocaleDateString('en-GB')}>
                            <span className="date-text">{formatDate(t, dep.lastPublishDate)}</span>
                          </Tooltip>
                        ) : dep.checkError ? (
                          <Tooltip text={dep.checkError}>
                            <span className="not-available">-</span>
                          </Tooltip>
                        ) : (
                          <span className="checking">{t.states.checkingShort}</span>
                        )}
                      </td>
                    )}

                    <td className="action-cell">
                      <div className="action-buttons">
                        {dep.updateAvailable && dep.latestVersion ? (
                          <button
                            className="update-btn"
                            onClick={() => handleUpdate(dep)}
                            disabled={updatingPackages.has(dep.name) || isLoading}
                          >
                            {updatingPackages.has(dep.name) ? '...' : t.buttons.update}
                          </button>
                        ) : (
                          <span className="up-to-date">
                            <i className="codicon codicon-check" />
                          </span>
                        )}
                        {dep.repositoryUrl && (
                          <Tooltip text={t.tooltips.viewChangelog}>
                            <button
                              className="changelog-btn"
                              onClick={() => onOpenExternal?.(`${dep.repositoryUrl}/releases`)}
                              title={t.tooltips.viewChangelog}
                            >
                              <i className="codicon codicon-book" />
                            </button>
                          </Tooltip>
                        )}
                        {onWhyInstalled && (
                          <Tooltip text={t.whyInstalled.tooltip}>
                            <button
                              className="why-btn"
                              onClick={e => {
                                e.stopPropagation();
                                onWhyInstalled(dep.name);
                              }}
                              disabled={isLoading}
                              title={t.whyInstalled.tooltip}
                            >
                              <i className="codicon codicon-type-hierarchy" />
                            </button>
                          </Tooltip>
                        )}
                        <button
                          className="uninstall-btn"
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmUninstall(dep.name);
                          }}
                          disabled={isLoading}
                          title={t.tooltips.uninstallPackage}
                          type="button"
                        >
                          <i className="codicon codicon-trash" />
                        </button>
                        <button
                          className="ignore-btn"
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmIgnore({ name: dep.name, isIgnored: false });
                          }}
                          disabled={isLoading}
                          title={t.tooltips.ignorePackage}
                        >
                          <i className="codicon codicon-eye-closed" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {ignoredDeps.length > 0 && (
                  <>
                    <tr className="ignored-separator" onClick={() => setShowIgnored(!showIgnored)}>
                      <td colSpan={visibleColumnCount}>
                        <i className={`codicon codicon-chevron-${showIgnored ? 'down' : 'right'}`} />
                        {interpolate(t.ignored.title, { count: ignoredDeps.length })}&apos;
                      </td>
                    </tr>
                    {showIgnored &&
                      ignoredDeps.map(dep => (
                        <tr key={dep.name} className="ignored-row">
                          <td className="checkbox-cell">
                            <input type="checkbox" disabled title={t.columns.action} />
                          </td>
                          <td className="package-name">
                            <div className="package-info">
                              <span className="package-link-disabled">{dep.name}</span>
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
                            <code title={dep.declaredVersion}>{dep.declaredVersion}</code>
                          </td>
                          <td className="version-cell">
                            {dep.latestVersion ? (
                              <code>{dep.latestVersion}</code>
                            ) : dep.checkError ? (
                              <Tooltip text={dep.checkError}>
                                <span className="not-available">-</span>
                              </Tooltip>
                            ) : (
                              <span className="checking">{t.states.checkingShort}</span>
                            )}
                          </td>
                          {columnConfig.size && (
                            <td className="size-cell">
                              <span className="size-text">{dep.size || '-'}</span>
                            </td>
                          )}
                          {columnConfig.semverUpdate && <td className="update-type-cell" />}
                          {columnConfig.lastUpdate && (
                            <td className="date-cell">
                              {dep.lastPublishDate ? (
                                <span className="date-text">{formatDate(t, dep.lastPublishDate)}</span>
                              ) : dep.checkError ? (
                                <Tooltip text={dep.checkError}>
                                  <span className="not-available">-</span>
                                </Tooltip>
                              ) : (
                                <span className="checking">{t.states.checkingShort}</span>
                              )}
                            </td>
                          )}
                          <td className="action-cell">
                            <div className="action-buttons">
                              <Tooltip text={t.tooltips.unignorePackage}>
                                <button
                                  className="unignore-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setConfirmIgnore({ name: dep.name, isIgnored: true });
                                  }}
                                  disabled={isLoading}
                                  title={t.tooltips.unignorePackage}
                                >
                                  <i className="codicon codicon-eye" />
                                </button>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="footer">
        <span>
          {interpolate(t.footer.showing, { filtered: sortedAndFilteredDeps.length, total: dependencies.length })}
          {ignoredDeps.length > 0 ? ` ${interpolate(t.footer.ignored, { count: ignoredDeps.length })}` : ''}
        </span>
        {rollbackMessage && (
          <span className="rollback-message">
            <i className="codicon codicon-history" /> {rollbackMessage}
          </span>
        )}
        {updateCount > 0 && (
          <span className="update-summary">
            {updateCount === 1
              ? interpolate(t.footer.updatesAvailable, { count: updateCount })
              : interpolate(t.footer.updatesAvailable_plural, { count: updateCount })}
          </span>
        )}
      </div>

      {confirmUninstall && (
        <div className="modal-overlay" onClick={() => setConfirmUninstall(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{t.modals.uninstallTitle}</h3>
            <p
              dangerouslySetInnerHTML={{
                __html: interpolate(t.modalMessages.confirmUninstall, { name: confirmUninstall }),
              }}
            />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setConfirmUninstall(null)}>
                {t.buttons.cancel}
              </button>
              <button
                className="modal-btn confirm"
                onClick={() => {
                  onUninstall?.(confirmUninstall);
                  // Remove from selection as well
                  setSelectedPackages(prev => {
                    if (prev.has(confirmUninstall)) {
                      const next = new Set(prev);
                      next.delete(confirmUninstall);
                      return next;
                    }
                    return prev;
                  });
                  setConfirmUninstall(null);
                }}
              >
                {t.buttons.uninstall}
              </button>
            </div>
          </div>
        </div>
      )}

      {versionPickerOpen && (
        <div className="modal-overlay" onClick={() => setVersionPickerOpen(null)}>
          <div className="modal-content modal-content-large" onClick={e => e.stopPropagation()}>
            <h3>{interpolate(t.modals.selectVersionTitle || 'Select Version for {{name}}', { name: versionPickerOpen.name })}</h3>
            <p className="modal-version-info">
              <span className="version-from">{versionPickerOpen.declaredVersion}</span>
              <i className="codicon codicon-arrow-right" />
              <span className="version-to">{selectedVersion}</span>
            </p>
            <div className="exact-version-checkbox">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useExactVersion}
                  onChange={e => setUseExactVersion(e.target.checked)}
                />
                <span className="checkmark"></span>
                <span className="label-text">
                  <i className="codicon codicon-pin" /> Pin exact version (--save-exact)
                </span>
              </label>
              <span className="hint">Installs without ^ or ~ prefix</span>
            </div>
            <div className="version-list">
              {/* Latest option */}
              <div
                className={`version-item ${selectedVersion === 'latest' ? 'selected' : ''}`}
                onClick={() => handleVersionSelect('latest')}
              >
                <div className="version-radio">
                  <input
                    type="radio"
                    name="version"
                    value="latest"
                    checked={selectedVersion === 'latest'}
                    onChange={() => handleVersionSelect('latest')}
                  />
                </div>
                <div className="version-info">
                  <span className="version-number">
                    latest
                    <span className="latest-badge">dist-tag</span>
                  </span>
                  <span className="version-date">Resolves to {versionPickerOpen.latestVersion}</span>
                </div>
              </div>
              
              <div className="version-separator">Or select a specific version:</div>
              
              {isLoadingVersions?.(versionPickerOpen.name) ? (
                <div className="version-loading">{t.states.loadingVersions || 'Loading versions...'}</div>
              ) : (
                (() => {
                  const versions = getVersionsForPackage?.(versionPickerOpen.name) || [];
                  if (versions.length === 0) {
                    return (
                      <div className="version-loading">
                        No versions found. Please try again.
                      </div>
                    );
                  }
                  
                  // Split into stable and prerelease versions
                  const stableVersions = versions.filter(v => v.releaseType === 'stable');
                  const prereleaseVersions = versions.filter(v => v.releaseType === 'prerelease');
                  
                  return (
                    <>
                      {/* Stable versions first */}
                      {stableVersions.length > 0 && (
                        <>
                          <div className="version-separator">Stable versions</div>
                          {stableVersions.map(v => (
                            <div
                              key={v.version}
                              className={`version-item ${v.version === selectedVersion ? 'selected' : ''} ${v.isDeprecated ? 'deprecated' : ''} ${v.version === versionPickerOpen.latestVersion ? 'latest' : ''}`}
                              onClick={() => handleVersionSelect(v.version)}
                            >
                              <div className="version-radio">
                                <input
                                  type="radio"
                                  name="version"
                                  value={v.version}
                                  checked={v.version === selectedVersion}
                                  onChange={() => handleVersionSelect(v.version)}
                                />
                              </div>
                              <div className="version-info">
                                <span className="version-number">
                                  {v.version}
                                  {v.version === versionPickerOpen.latestVersion && (
                                    <span className="latest-badge">{t.labels.latest || 'latest'}</span>
                                  )}
                                  {v.isDeprecated && (
                                    <span className="deprecated-badge">{t.labels.deprecated || 'deprecated'}</span>
                                  )}
                                </span>
                                <span className="version-date">{formatDate(t, v.date)}</span>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Pre-release versions (collapsible) */}
                      {prereleaseVersions.length > 0 && (
                        <PrereleaseSection
                          versions={prereleaseVersions}
                          selectedVersion={selectedVersion}
                          onSelect={handleVersionSelect}
                          formatDate={(date: string) => formatDate(t, date)}
                        />
                      )}
                    </>
                  );
                })()
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setVersionPickerOpen(null)}>
                {t.buttons.cancel}
              </button>
              <button
                className="modal-btn confirm"
                onClick={confirmVersionUpdate}
                disabled={!selectedVersion || isLoadingVersions?.(versionPickerOpen.name)}
              >
                {t.buttons.update}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmUpdateAll && (
        <div className="modal-overlay" onClick={() => setConfirmUpdateAll(null)}>
          <div className="modal-content modal-content-large" onClick={e => e.stopPropagation()}>
            <h3>{t.modals.updateAllTitle}</h3>
            <p
              dangerouslySetInnerHTML={{
                __html:
                  confirmUpdateAll.length === 1
                    ? interpolate(t.modalMessages.confirmUpdateAll, { count: confirmUpdateAll.length })
                    : interpolate(t.modalMessages.confirmUpdateAll_plural, { count: confirmUpdateAll.length }),
              }}
            />
            <div className="modal-package-list">
              {confirmUpdateAll.slice(0, 10).map(dep => (
                <div key={dep.name} className="modal-package-item">
                  <span className="package-name-text">{dep.name}</span>
                  <span className="version-arrow">
                    <span className="version-from-small">{dep.declaredVersion}</span>
                    <i className="codicon codicon-arrow-small-right" />
                    <span className="version-to-small">{dep.latestVersion}</span>
                  </span>
                </div>
              ))}
              {confirmUpdateAll.length > 10 && (
                <div className="modal-package-item more-items">
                  {interpolate(t.modalMessages.andMore, { count: confirmUpdateAll.length - 10 })}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setConfirmUpdateAll(null)}>
                {t.buttons.cancel}
              </button>
              <button className="modal-btn confirm" onClick={confirmUpdateAllPackages}>
                {t.buttons.updateAll}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmUpdateSelected && (
        <div className="modal-overlay" onClick={() => setConfirmUpdateSelected(null)}>
          <div className="modal-content modal-content-large" onClick={e => e.stopPropagation()}>
            <h3>{t.modals.updateSelectedTitle}</h3>
            <p
              dangerouslySetInnerHTML={{
                __html:
                  confirmUpdateSelected.length === 1
                    ? interpolate(t.modalMessages.confirmUpdateSelected, { count: confirmUpdateSelected.length })
                    : interpolate(t.modalMessages.confirmUpdateSelected_plural, {
                        count: confirmUpdateSelected.length,
                      }),
              }}
            />
            <div className="modal-package-list">
              {confirmUpdateSelected.slice(0, 10).map(dep => (
                <div key={dep.name} className="modal-package-item">
                  <span className="package-name-text">{dep.name}</span>
                  <span className="version-arrow">
                    <span className="version-from-small">{dep.declaredVersion}</span>
                    <i className="codicon codicon-arrow-small-right" />
                    <span className="version-to-small">{dep.latestVersion}</span>
                  </span>
                </div>
              ))}
              {confirmUpdateSelected.length > 10 && (
                <div className="modal-package-item more-items">
                  {interpolate(t.modalMessages.andMore, { count: confirmUpdateSelected.length - 10 })}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setConfirmUpdateSelected(null)}>
                {t.buttons.cancel}
              </button>
              <button className="modal-btn confirm" onClick={confirmUpdateSelectedPackages}>
                {t.buttons.updateSelected}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmIgnore && (
        <div className="modal-overlay" onClick={() => setConfirmIgnore(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{confirmIgnore.isIgnored ? t.modals.unignoreTitle : t.modals.ignoreTitle}</h3>
            <p
              dangerouslySetInnerHTML={{
                __html: confirmIgnore.isIgnored
                  ? interpolate(t.modalMessages.confirmUnignore, { name: confirmIgnore.name })
                  : interpolate(t.modalMessages.confirmIgnore, { name: confirmIgnore.name }),
              }}
            />
            {!confirmIgnore.isIgnored && <p className="modal-hint">{t.modalMessages.ignoreHint}</p>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setConfirmIgnore(null)}>
                {t.buttons.cancel}
              </button>
              <button
                className="modal-btn confirm"
                onClick={() => {
                  onToggleIgnore?.(confirmIgnore.name);
                  setConfirmIgnore(null);
                }}
              >
                {confirmIgnore.isIgnored ? t.buttons.unignore : t.buttons.ignore}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRollback && lastUpdate && (
        <div className="modal-overlay" onClick={() => setConfirmRollback(false)}>
          <div className="modal-content modal-content-large" onClick={e => e.stopPropagation()}>
            <h3>{t.modals.rollbackTitle}</h3>
            <p
              dangerouslySetInnerHTML={{
                __html:
                  lastUpdate.packages.length === 1
                    ? interpolate(t.modalMessages.confirmRollback, { count: lastUpdate.packages.length })
                    : interpolate(t.modalMessages.confirmRollback_plural, { count: lastUpdate.packages.length }),
              }}
            />
            <p className="modal-hint">{t.modalMessages.rollbackDetails}</p>
            <div className="modal-package-list">
              {lastUpdate.packages.slice(0, 10).map(pkg => (
                <div key={pkg.name} className="modal-package-item">
                  <span className="package-name-text">{pkg.name}</span>
                  <span className="version-arrow">
                    <span className="version-from-small">{pkg.previousDeclaredVersion}</span>
                    <i className="codicon codicon-arrow-small-right" />
                    <span className="version-to-small">{pkg.newVersion}</span>
                  </span>
                </div>
              ))}
              {lastUpdate.packages.length > 10 && (
                <div className="modal-package-item more-items">
                  {interpolate(t.modalMessages.andMore, { count: lastUpdate.packages.length - 10 })}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setConfirmRollback(false)}>
                {t.buttons.cancel}
              </button>
              <button
                className="modal-btn confirm"
                onClick={() => {
                  onRollback?.();
                  setConfirmRollback(false);
                }}
              >
                {t.buttons.rollback}
              </button>
            </div>
          </div>
        </div>
      )}

      {(whyLoadingPackage || whyResult) && (
        <div className="modal-overlay" onClick={() => onCloseWhy?.()}>
          <div className="modal-content modal-content-large" onClick={e => e.stopPropagation()}>
            <h3>
              {interpolate(t.whyInstalled.title, {
                name: whyResult?.packageName || whyLoadingPackage || '',
              })}
            </h3>
            {whyLoadingPackage && !whyResult ? (
              <div className="why-loading">
                <div className="spinner"></div>
                <span>{t.whyInstalled.loading}</span>
              </div>
            ) : whyResult?.error ? (
              <p className="why-error">{whyResult.error}</p>
            ) : whyResult?.unsupported ? (
              <p className="why-empty">{t.whyInstalled.unsupported}</p>
            ) : whyResult?.notInstalled ? (
              <p className="why-empty why-not-installed">
                <i className="codicon codicon-info" /> {t.whyInstalled.notInstalled}
              </p>
            ) : whyResult && whyResult.chains.length === 0 ? (
              <p className="why-empty">{t.whyInstalled.noResults}</p>
            ) : whyResult ? (
              (() => {
                const isDirect = whyResult.chains.some(chain => chain.length === 1);
                const otherChains = whyResult.chains.filter(chain => chain.length > 1);
                return (
                  <div className="why-chain-list">
                    {isDirect && (
                      <div className="why-chain">
                        <span className="why-direct-badge">
                          <i className="codicon codicon-package" /> {t.whyInstalled.directBadge}
                        </span>
                        <span className="why-direct-text">{t.whyInstalled.direct}</span>
                      </div>
                    )}
                    {otherChains.length > 0 ? (
                      <>
                        <div className="why-section-title">{t.whyInstalled.alsoRequiredBy}</div>
                        {otherChains.map((chain, index) => (
                          <div key={index} className="why-chain">
                            {chain.map((segment, segmentIndex) => (
                              <span key={segmentIndex} className="why-segment-wrapper">
                                {segmentIndex > 0 && <i className="codicon codicon-arrow-small-right" />}
                                <code
                                  className={`why-segment ${segmentIndex === chain.length - 1 ? 'why-target' : ''}`}
                                >
                                  {segment}
                                </code>
                              </span>
                            ))}
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="why-empty why-only-direct">
                        <i className="codicon codicon-check" /> {t.whyInstalled.onlyDirect}
                      </p>
                    )}
                  </div>
                );
              })()
            ) : null}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => onCloseWhy?.()}>
                {t.whyInstalled.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {vulnerabilityModalPackage && (
        <div className="modal-overlay" onClick={() => setVulnerabilityModalPackage(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Vulnerabilities: {vulnerabilityModalPackage}</h3>
            <div className="modal-package-list">
              {dependencies
                .find(d => d.name === vulnerabilityModalPackage)
                ?.vulnerabilities?.map(v => (
                  <div key={v.id} className="modal-package-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span
                        className={`semver-badge semver-${
                          v.severity === 'critical' || v.severity === 'high'
                            ? 'major'
                            : v.severity === 'moderate'
                              ? 'minor'
                              : 'patch'
                        }`}
                      >
                        {v.severity}
                      </span>
                      <span className="package-name-text">{v.title}</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        justifyContent: 'flex-end',
                      }}
                    >
                      {v.url && (
                        <button
                          className="modal-btn confirm"
                          onClick={() => onOpenExternal?.(v.url!)}
                          title="View advisory"
                        >
                          <i className="codicon codicon-link-external" /> {t.buttons.viewAdvisory}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setVulnerabilityModalPackage(null)}>
                {t.buttons.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
