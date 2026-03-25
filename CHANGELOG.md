# Change Log

All notable changes to the "npm-visual-manager" extension will be documented in this file.

## [1.4.0] - 2026-03-25

### Changed
- **Unified Rollback Modal**: Rollback confirmation now uses the same styled modal as other actions
  - Replaced native VS Code `showWarningMessage` modal with custom webview modal
  - Consistent styling with Update, Uninstall, and Ignore modals
  - Shows list of packages to rollback with version details
  - Supports all 8 languages (i18n)
- **Removed Webview Progress Messages**: Eliminated redundant progress bar at the top of the panel
  - Progress messages like "Installing package@version..." no longer appear in the webview UI
  - Only VS Code native notifications are used for operation progress
  - Cleaner interface during package operations

## [1.3.0] - 2026-03-15

### Added
- **Enhanced Sidebar**: Redesigned welcome view with improved visuals
  - Added logo with gradient styling and version badge
  - Added Quick Links section (Documentation, Report Issue)
  - Added Tips section with helpful hints
  - Improved responsive design for narrow sidebars
- **Testing Infrastructure**: Added Vitest for unit and integration testing
  - Tests for npmService (semver utilities)
  - Tests for packageService (file operations)
  - Tests for cacheService (LRU eviction)
- **CI/CD**: Added GitHub Actions workflow
  - Automated testing on push and PR
  - TypeScript compilation checks
  - ESLint validation
- **Cache Size Limit**: Added MAX_ENTRIES (500) to prevent unlimited cache growth
  - Implements LRU (Least Recently Used) eviction policy
  - Removes oldest entries when limit is exceeded

### Changed
- **Dependencies Updated**:
  - React 18.2.0 → 19.2.4
  - Vite 5.4.21 → 8.0.0
  - TypeScript 5.3.0 → 5.9.3
  - @types/vscode 1.85.0 → 1.110.0
- **TypeScript Strict Mode**: Enabled additional compiler options
  - noImplicitReturns, noUncheckedIndexedAccess, noImplicitOverride
- **Code Quality**: Added Prettier configuration for consistent formatting

## [1.2.0] - 2026-03-12

### Added
- **Internationalization (i18n)**: Full UI translation support
  - Complete Spanish (es) translation for all UI elements, buttons, tooltips, modals, and messages
  - Complete German (de) translation
  - Complete French (fr) translation
  - Complete Chinese Simplified (zh-cn) translation
  - Complete Japanese (ja) translation
  - Complete Portuguese/Brazilian (pt-br) translation
  - Complete Russian (ru) translation
  - Complete Korean (ko) translation
  - Automatic language detection based on VS Code display language
  - New i18n architecture supporting easy addition of new languages

## [1.1.0] - 2026-03-11

### Changed
- **Changelog viewer**: Changed external URL handling to always open in the system's default browser
  - This improves compatibility with non-VS Code IDEs (e.g., Antigravity, Cursor, Winds)
  - Previously used `simpleBrowser.show` which is blocked by CSP on some sites like GitHub in certain IDEs

### Fixed
- **TypeScript configuration**: Added explicit `"types": ["node"]` to `tsconfig.json` to resolve `console` type errors in the editor

## [1.0.1] - 2026-03-09

### Fixed
- **Action Column Layout**: Fixed fragile absolute positioning of action buttons (changelog, hide, uninstall)
  - Replaced absolute positioning with flexbox layout for consistent alignment
  - Fixed column width to 140px with `table-layout: fixed` to prevent layout stretching
  - Buttons now align consistently to the right regardless of content

## [1.0.0] - 2026-03-09

### Changed
- **Reliable command execution**: Replaced fixed `setTimeout` delays (5s/8s) with real process completion detection
  - Package install, update, uninstall, and rollback operations now wait for the command to actually finish
  - Output is streamed in real-time to a VS Code OutputChannel instead of using a terminal
  - The dependency table only reloads after the command has completed, ensuring accurate data
- **Code quality**: Standardized all code comments from Spanish to English for consistency
- **Code deduplication**: Extracted shared `getNonce()` utility to `src/utils/nonce.ts` (was duplicated in webviewPanel.ts and sidebarProvider.ts)
- **Type deduction**: Eliminated duplicated types between host and webview by creating a shared `types/` directory at the project root.
- **Improved UX**: Removed the duplicated `isUpdateAvailable` logic from the frontend to seamlessly use the backend's explicit semver types.
- **Code quality**: Added ESLint with `@typescript-eslint` plugin on both the root extension package and the frontend `webview-ui` package.
- **Robust Error Handling**: Replaced global webview error screens with native VS Code notifications for operation failures, ensuring the UI remains responsive even if `npm` commands fail.
- **Search Debounce & Cancellation**: Implemented `AbortSignal` for package search. Fast typing now cancels previous requests in the backend, preventing race conditions and unnecessary network traffic.
- **FileWatcher Auto-Refresh**: Added a `FileSystemWatcher` for `package.json`. The UI now automatically reloads when manual edits are detected in the project files.
- **UI Alignment Polish**: Refined the "Action" column styling to perfectly center the primary action button while neatly tucking secondary controls into absolute-positioned side slots, eliminating layout jitter on hover.

### Added
- New `src/utils/commandRunner.ts` utility for executing shell commands with real-time output streaming

### Removed
- Removed dedicated terminal (`NPM Visual Manager`) for package operations — now uses OutputChannel

## [0.9.0] - 2026-03-04

### Added
- **Smart Package Search**: Install Packages section now detects already installed packages
  - When searching for a package that is already installed, shows "Uninstall" button instead of "Install"
  - Confirmation dialog before uninstalling with "Are you sure..." message
  - "Go Back" button to return to search results without action
- **Improved Install Packages UX**: Click anywhere on the "Install Packages" header to expand/collapse
  - No longer limited to clicking only the chevron icon
  - Better visual feedback with hover state

### Changed
- **Uninstall Button Styling**: Red color now matches VS Code's error theme color
  - More consistent with VS Code's design language
  - Adapts to user's color theme automatically

## [0.8.0] - 2026-03-02

### Changed
- **Cache Location**: Moved cache file from `.vscode/.npm-visual-manager-cache.json` to VS Code's global storage
  - Cache is now stored in the extension's global storage directory (hidden from users)
  - No more clutter in project's `.vscode` folder
  - Cache files are named `cache-{projectHash}.json` and stored per project
  - Backward compatible: falls back to old location if global storage is not available

### Added
- **Confirmation Modals for All Actions**: All destructive/update actions now show consistent confirmation modals
  - **Update Package**: Shows version change (from → to) before updating
  - **Update All**: Shows list of all packages to be updated (up to 10, then "and X more")
  - **Update Selected**: Shows list of selected packages with version changes
  - **Ignore Package**: Confirmation with explanation that ignored packages are excluded from update checks
  - **Unignore Package**: Confirmation to re-enable update checks for the package
  - All modals use consistent styling with Cancel/Confirm buttons

### Fixed
- **Security Icon Tooltip**: Added tooltip "No security issues detected" to the shield icon for packages without vulnerabilities

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
