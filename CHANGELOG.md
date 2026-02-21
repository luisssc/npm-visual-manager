# Change Log

All notable changes to the "npm-visual-manager" extension will be documented in this file.

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
