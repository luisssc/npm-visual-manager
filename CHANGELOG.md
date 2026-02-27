# Change Log

All notable changes to the "npm-visual-manager" extension will be documented in this file.

## [Unreleased]

## [0.7.1] - 2026-02-27

### Fixed
- **Progress message stuck**: "Installing N package(s)..." message no longer stays forever when updating multiple packages
  - Now uses native VS Code notification with auto-close after 3 seconds
  - Removed redundant progress indicator from webview UI
- **Sidebar text spacing**: Fixed line-height issue in welcome view when sidebar is narrow
  - Text no longer overlaps when "Ctrl+Shift+P" wraps to multiple lines

## [0.6.0] - 2026-02-21

### Added
- **Uninstall Packages**: Click the trash icon 🗑️ to remove packages
  - Confirmation modal before uninstalling
  - Works with npm, yarn, pnpm, and bun
  - Auto-refreshes the table after uninstall

### Fixed
- **Search Input Focus**: Fixed search input losing focus while typing
  - Removed `disabled` state during search
  - Added `memo` to prevent unnecessary re-renders
  - Confirmation modal before uninstalling
  - Works with npm, yarn, pnpm, and bun
  - Auto-refreshes the table after uninstall

## [0.5.1] - 2026-02-21

### Removed
- **Scripts Runner**: Removed the scripts panel feature
  - Use VS Code's built-in npm scripts view instead (Explorer > NPM Scripts)

## [0.5.0] - 2026-02-21

### Added
- **Changelog Viewer**: Click the book icon 📖 to view package releases on GitHub
  - Opens in VS Code's built-in browser
  - Only shown when repository URL is available
  - Appears on hover in the Action column
- **Version Mismatch Indicator**: Asterisk (*) shows when installed version differs from package.json
  - Hover over the asterisk to see the actual installed version
  - Helps detect manual edits or partial installs

### Fixed
- **Version Comparison**: Now correctly compares declared version (from package.json) with latest
  - Previously compared installed version, causing missed updates
- **Auto-refresh**: Table automatically reloads after successful package update
- **Clear Search**: Search results are cleared when search query is emptied

### Removed
- **Scripts Runner**: Removed the scripts panel feature
  - Use VS Code's built-in npm scripts view instead (Explorer > NPM Scripts)

## [0.4.0] - 2026-02-21

### Added
- **Package Search & Install**: Search and install new packages directly from the UI
  - Real-time search with debouncing against NPM registry
  - Shows package info: description, version, downloads, score
  - Install as dependency or devDependency
  - Supports npm, yarn, pnpm, and bun
  - New "Search Packages" tab in the UI

## [0.3.0] - 2026-02-21

### Added
- **Scripts Runner**: Execute npm scripts directly from the UI
  - Displays all scripts from package.json as clickable buttons
  - Color-coded buttons for common scripts (dev, build, test, etc.)
  - Runs scripts in integrated terminal
  - Supports npm, yarn, pnpm, and bun
- **Ignore Packages**: Click the eye icon 👁️‍🗨️ to ignore packages from update checks
  - Ignored packages are excluded from the "updates available" counter
  - Persisted in `.vscode/settings.json`
  - Eye icon appears on hover for each package
  - Click again to unignore

## [0.2.0] - 2026-02-21

### Added
- **Offline Mode with Cache**: Version data is now cached locally for 24 hours
  - Instant loading on subsequent opens
  - Works without internet connection (uses cached data)
  - Reduces NPM API calls and avoids rate limiting
  - Refresh button clears cache and fetches fresh data
- **Deprecation warnings**: Packages marked as deprecated by NPM now show a warning icon
  - Orange warning icon (⚠️) for deprecated packages
  - Tooltip shows deprecation message
- Multi-project support (monorepo detection)
- Support for npm, yarn, pnpm, and bun

### Changed
- Removed Security column from table
- Security and deprecation icons now appear inline with package name
- Refresh button now shows only icon (no text)
- Improved loading performance through intelligent caching

## [0.1.1] - 2026-02-20

### Added
- Extension icon for marketplace
- Gallery banner configuration
- Marketplace badges

## [0.1.0] - 2026-02-20

### Added
- Initial release
- Visual dependency table with sorting and filtering
- Automatic version checking from NPM registry
- One-click updates for individual packages
- Bulk update all outdated packages
- Security audit integration (vulnerability detection)
- Rollback functionality with version history
- Cross-platform support (Windows, macOS, Linux)
- Package size estimation
- Semver update type badges (MAJOR, MINOR, PATCH)
- Theme-aware UI using VS Code CSS variables
