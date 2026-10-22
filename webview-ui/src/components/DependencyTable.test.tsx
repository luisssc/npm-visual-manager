import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DependencyTable } from './DependencyTable';
import { I18nProvider } from '../i18n/I18nContext';
import type { Dependency, SemverUpdateType } from '../../../types';

const dep = (name: string, semverUpdateType?: SemverUpdateType, extra: Partial<Dependency> = {}): Dependency => ({
  name,
  declaredVersion: '^1.0.0',
  installedVersion: '1.0.0',
  latestVersion: semverUpdateType ? '2.0.0' : '1.0.0',
  updateAvailable: !!semverUpdateType,
  semverUpdateType: semverUpdateType ?? 'none',
  type: 'dependencies',
  ...extra,
});

const DEPENDENCIES = [
  dep('alpha', 'patch'),
  dep('bravo', 'major'),
  dep('charlie', 'minor'),
  dep('delta', 'major'),
  dep('echo'),
  dep('foxtrot', 'prerelease'),
  dep('golf', 'major', { isIgnored: true }),
];
const NAMES = DEPENDENCIES.map(d => d.name);

function renderTable(onUpdateAll = vi.fn(), showAllPackages = false, onExportUpdatePlan = vi.fn()) {
  const result = render(
    <I18nProvider>
      <DependencyTable
        dependencies={DEPENDENCIES}
        onUpdatePackage={vi.fn()}
        onUpdateAll={onUpdateAll}
        isLoading={false}
        columnConfig={{ size: false, type: false, lastUpdate: false, security: false, semverUpdate: true }}
        showAllPackages={showAllPackages}
        onExportUpdatePlan={onExportUpdatePlan}
      />
    </I18nProvider>
  );
  const rowNames = () =>
    Array.from(result.container.querySelectorAll('tbody tr'))
      .map(row => NAMES.find(name => row.querySelector('.package-name')?.textContent?.includes(name)))
      .filter(Boolean);
  const chip = (type: string) => result.container.querySelector(`.semver-chip-${type}`) as HTMLButtonElement;
  return { ...result, rowNames, chip };
}

describe('update type sorting and filtering', () => {
  it('sorts by update type, riskiest first, then reverses on second click', () => {
    const { container, rowNames } = renderTable();
    const header = container.querySelector('th.update-type-col')!;

    fireEvent.click(header);
    expect(rowNames()).toEqual(['bravo', 'delta', 'charlie', 'alpha', 'foxtrot']);

    fireEvent.click(header);
    expect(rowNames()).toEqual(['foxtrot', 'alpha', 'charlie', 'bravo', 'delta']);
  });

  it('keeps packages without updates last when showing all packages', () => {
    const { container, rowNames } = renderTable(vi.fn(), true);
    fireEvent.click(container.querySelector('th.update-type-col')!);
    expect(rowNames().slice(-1)[0]).toBe('echo');
  });

  it('shows one chip per pending update type with counts excluding ignored packages', () => {
    const { container, chip } = renderTable();
    expect(
      Array.from(container.querySelectorAll('.semver-chip')).map(c => c.className.match(/semver-chip-(\w+)/)![1])
    ).toEqual(['major', 'minor', 'patch', 'prerelease']);
    expect(chip('major').querySelector('.semver-chip-count')).toHaveTextContent('2');
  });

  it('filters by one or several update types and clears on second click', () => {
    const { rowNames, chip } = renderTable();

    fireEvent.click(chip('major'));
    expect(chip('major')).toHaveAttribute('aria-pressed', 'true');
    expect(rowNames()).toEqual(['bravo', 'delta']);

    fireEvent.click(chip('patch'));
    expect(rowNames()).toEqual(['alpha', 'bravo', 'delta']);

    fireEvent.click(chip('major'));
    fireEvent.click(chip('patch'));
    expect(rowNames()).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'foxtrot']);
  });

  it('limits Update All to the filtered packages and shows their count', () => {
    const onUpdateAll = vi.fn();
    const { container, chip } = renderTable(onUpdateAll);

    expect(container.querySelector('.update-all-btn')).toHaveTextContent('(5)');
    fireEvent.click(chip('patch'));
    fireEvent.click(chip('minor'));
    expect(container.querySelector('.update-all-btn')).toHaveTextContent('(2)');

    fireEvent.click(container.querySelector('.update-all-btn')!);
    fireEvent.click(container.querySelector('.modal-btn.confirm')!);
    expect(onUpdateAll).toHaveBeenCalledWith([
      { name: 'alpha', version: '2.0.0', currentVersion: '^1.0.0' },
      { name: 'charlie', version: '2.0.0', currentVersion: '^1.0.0' },
    ]);
  });

  it('counts only visible selected packages after filtering', () => {
    const { container, chip } = renderTable();
    fireEvent.click(container.querySelector('th.checkbox-col input')!);
    expect(container.querySelector('.update-selected-btn')).toHaveTextContent('(5)');

    fireEvent.click(chip('major'));
    expect(container.querySelector('.update-selected-btn')).toHaveTextContent('(2)');
  });

  it('reports no matches instead of "all up to date" when filters hide every update', () => {
    const { container, getByText } = renderTable();
    fireEvent.change(container.querySelector('.filter-input')!, { target: { value: 'zzz' } });
    expect(getByText('No packages match the current filter')).toBeInTheDocument();
  });
});

describe('AI update prompt', () => {
  it('sends only the visible, non-ignored pending updates', () => {
    const onExport = vi.fn();
    const { container, chip } = renderTable(vi.fn(), true, onExport);
    fireEvent.click(chip('major'));
    fireEvent.click(container.querySelector('.export-plan-btn')!);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0]![0].map((d: Dependency) => d.name)).toEqual(['bravo', 'delta']);
  });

  it('is hidden when no update is visible', () => {
    const { container } = renderTable();
    fireEvent.change(container.querySelector('.filter-input')!, { target: { value: 'zzz' } });
    expect(container.querySelector('.export-plan-btn')).toBeNull();
  });
});

describe('last update tooltip', () => {
  it('shows the publish date and when the user last updated the package', () => {
    const { container } = render(
      <I18nProvider>
        <DependencyTable
          dependencies={[
            dep('alpha', 'patch', { lastPublishDate: '2026-10-19T00:00:00Z', userUpdatedAt: '2026-10-12T00:00:00Z' }),
          ]}
          onUpdatePackage={vi.fn()}
          onUpdateAll={vi.fn()}
          isLoading={false}
          columnConfig={{ size: false, type: false, lastUpdate: true, security: false, semverUpdate: true }}
          showAllPackages={false}
        />
      </I18nProvider>
    );
    expect(container.querySelector('.date-cell .tooltip')?.textContent).toBe(
      'Published: 19/10/2026\nYou updated: 12/10/2026'
    );
  });
});
