import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchPanel } from './SearchPanel';
import { I18nProvider } from '../i18n/I18nContext';
import type { SearchResult } from '../../../types';

const mockSearchResult: SearchResult = {
  name: 'lodash',
  version: '4.17.21',
  description: 'A modern JavaScript utility library',
  keywords: ['util', 'utility'],
  date: '2021-02-20T00:00:00.000Z',
  publisher: { username: 'lodash' },
  downloads: { weekly: 50000000 },
  score: {
    final: 0.95,
    quality: 0.9,
    popularity: 1,
    maintenance: 0.9,
  },
};

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);

describe('SearchPanel', () => {
  const mockOnSearch = vi.fn();
  const mockOnInstall = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders collapsed by default', () => {
    render(
      <SearchPanel
        results={[]}
        onSearch={mockOnSearch}
        onInstall={mockOnInstall}
        installedPackages={[]}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText(/install packages/i)).toBeInTheDocument();
  });

  it('expands when clicked', () => {
    render(
      <SearchPanel
        results={[]}
        onSearch={mockOnSearch}
        onInstall={mockOnInstall}
        installedPackages={[]}
      />,
      { wrapper: Wrapper }
    );

    const header = screen.getByText(/install packages/i);
    fireEvent.click(header);

    expect(screen.getByPlaceholderText(/search npm packages/i)).toBeInTheDocument();
  });

  it('shows search results', () => {
    render(
      <SearchPanel
        results={[mockSearchResult]}
        onSearch={mockOnSearch}
        onInstall={mockOnInstall}
        installedPackages={[]}
      />,
      { wrapper: Wrapper }
    );

    // Expand panel
    fireEvent.click(screen.getByText(/install packages/i));

    // Check that the package name is shown using a more specific selector
    expect(screen.getByText('lodash', { selector: '.result-name' })).toBeInTheDocument();
    
    // Check version
    expect(screen.getByText(/4\.17\.21/)).toBeInTheDocument();
    
    // Check description
    expect(screen.getByText(/A modern JavaScript utility library/)).toBeInTheDocument();
  });

  it('shows install button for non-installed packages', () => {
    render(
      <SearchPanel
        results={[mockSearchResult]}
        onSearch={mockOnSearch}
        onInstall={mockOnInstall}
        installedPackages={[]}
      />,
      { wrapper: Wrapper }
    );

    // Expand panel
    fireEvent.click(screen.getByText(/install packages/i));

    // Click on the package to select it
    fireEvent.click(screen.getByText('lodash', { selector: '.result-name' }));

    // Now should show install section
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
  });

  it('formats download numbers correctly', () => {
    render(
      <SearchPanel
        results={[mockSearchResult]}
        onSearch={mockOnSearch}
        onInstall={mockOnInstall}
        installedPackages={[]}
      />,
      { wrapper: Wrapper }
    );

    // Expand panel
    fireEvent.click(screen.getByText(/install packages/i));

    // 50M downloads - look for the formatted text with /wk suffix
    expect(screen.getByText(/50\.0M.*wk/)).toBeInTheDocument();
  });
});
