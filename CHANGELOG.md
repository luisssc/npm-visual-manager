# Change Log

All notable changes to the "npm-visual-manager" extension will be documented in this file.

## [0.2.1] - 2026-02-21

### Changed
- Unified refresh button (now clears cache automatically)
- Removed Security column from table
- Added package icon next to package name

## [0.2.0] - 2026-02-21

### Added
- **Offline Mode with Cache**: Version data is now cached locally for 24 hours
  - Instant loading on subsequent opens
  - Works without internet connection (uses cached data)
  - Reduces NPM API calls and avoids rate limiting
  - Visual indicator showing cache age

### Changed
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
- Multi-project support (monorepo detection)
- Cross-platform support (Windows, macOS, Linux)
- Support for npm, yarn, pnpm, and bun
- Package size estimation
- Semver update type badges (MAJOR, MINOR, PATCH)
- Theme-aware UI using VS Code CSS variables
