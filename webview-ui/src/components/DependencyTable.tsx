import { useState, useMemo, ReactNode, useEffect } from 'react';
import type { Dependency, SemverUpdateType, ColumnConfig, UpdateHistory } from '../../../types';
import './DependencyTable.css';
import { useTranslation, interpolate } from '../i18n/I18nContext';

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
  onOpenExternal?: (url: string) => void;
  onUninstall?: (packageName: string) => void;
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
}: DependencyTableProps) => {
  const t = useTranslation();
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filter, setFilter] = useState('');
  const [updatingPackages, setUpdatingPackages] = useState<Set<string>>(new Set());
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [showIgnored, setShowIgnored] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState<Dependency | null>(null);
  const [confirmUpdateAll, setConfirmUpdateAll] = useState<Dependency[] | null>(null);
  const [confirmUpdateSelected, setConfirmUpdateSelected] = useState<Dependency[] | null>(null);
  const [confirmIgnore, setConfirmIgnore] = useState<{ name: string; isIgnored: boolean } | null>(null);
  const [confirmRollback, setConfirmRollback] = useState(false);

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
    setConfirmUpdate(dep);
  };

  const confirmUpdatePackage = () => {
    if (!confirmUpdate) {
      return;
    }
    setUpdatingPackages(prev => new Set(prev).add(confirmUpdate.name));
    onUpdatePackage(confirmUpdate.name, 'latest', confirmUpdate.declaredVersion);
    setConfirmUpdate(null);
    setTimeout(() => {
      setUpdatingPackages(prev => {
        const next = new Set(prev);
        next.delete(confirmUpdate.name);
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
            comparison = (a.size || '').localeCompare(b.size || '');
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
                            <span className="status-badge status-danger">
                              <i className="codicon codicon-warning" /> {dep.vulnerabilityCount || 1}
                            </span>
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
                      <code>{dep.declaredVersion}</code>
                      {dep.declaredVersion !== dep.installedVersion && (
                        <Tooltip text={`${t.columns.installed}: ${dep.installedVersion}`}>
                          <span className="version-mismatch-icon">*</span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="version-cell">
                      {dep.latestVersion ? (
                        <code className={dep.updateAvailable ? 'latest-version' : ''}>{dep.latestVersion}</code>
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
                            <code>{dep.declaredVersion}</code>
                          </td>
                          <td className="version-cell">
                            {dep.latestVersion ? (
                              <code>{dep.latestVersion}</code>
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
                              <span className="date-text">{formatDate(t, dep.lastPublishDate)}</span>
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

      {confirmUpdate && (
        <div className="modal-overlay" onClick={() => setConfirmUpdate(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{t.modals.updateTitle}</h3>
            <p
              dangerouslySetInnerHTML={{
                __html: interpolate(t.modalMessages.confirmUpdate, { name: confirmUpdate.name }),
              }}
            />
            <p className="modal-version-info">
              <span className="version-from">{confirmUpdate.declaredVersion}</span>
              <i className="codicon codicon-arrow-right" />
              <span className="version-to">{confirmUpdate.latestVersion}</span>
            </p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setConfirmUpdate(null)}>
                {t.buttons.cancel}
              </button>
              <button className="modal-btn confirm" onClick={confirmUpdatePackage}>
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
    </div>
  );
};
