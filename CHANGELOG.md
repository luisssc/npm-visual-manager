# Change Log

All notable changes to the "npm-visual-manager" extension will be documented in this file.

## [1.9.0] - 2026-08-21

### Added
- **Every view now names the `package.json` it is acting on** ([#8](https://github.com/luisssc/npm-visual-manager/issues/8)): repos holding several `package.json` files (a WordPress theme plus its plugins, a monorepo, a site with a build folder) gave no way to tell which file the panel had picked, so it was not clear what an update would rewrite.
  - The project selector now labels each entry `name — relative/path`, since `package.json` names repeat across a repo, or are missing entirely, and the name alone did not identify the file. Hovering an entry shows its absolute path.
  - A new chip next to the selector shows the target file (e.g. `wp-content/themes/mytheme/package.json`) and opens it in the editor when clicked. It is shown for single-project workspaces too.
  - The editor tab title carries the relative path for non-root projects (`NPM: mytheme (wp-content/themes/mytheme)`).
  - Update, update all, update selected, install, uninstall and rollback confirmations state the file they apply to, and the progress notifications name it as well (`Updating react in wp-content/themes/mytheme/package.json...`).
  - **Projects nested more than three levels deep were never discovered at all**, so in those repos there was nothing to label: a Bedrock-style WordPress repo keeps its theme at `web/app/themes/<theme>` (four levels) and only the root `package.json` showed up. The scan now goes five levels deep by default and skips dependency/output folders (`vendor`, `uploads`, `dist`, `out`, `coverage`, `tmp`, `temp`, `bower_components`, plus `node_modules` and dotted folders as before), which more than pays for the extra depth: on a 2,300-folder WordPress-like tree the full scan takes ~90 ms, against ~300 ms without the exclusions. Both are configurable via `npm-visual-manager.scan.maxDepth` and `npm-visual-manager.scan.excludeFolders`.
  - The "Updates" view now lists one row per `package.json` that has updates or vulnerabilities, sorted by update count, each opening the manager on that project. Previously only the workspace total was shown, which could not be reconciled with the single project the panel displays.

## [1.8.3] - 2026-08-04

### Fixed
- **The manager's editor tab had no icon in installed builds**: `.vscodeignore` excluded `resources/*.svg`, but the panel loads its theme-aware tab icon from `resources/icon-light.svg` and `icon-dark.svg`. The icon therefore appeared when running from source and was missing from every published build. Both files are now packaged; `icon-theme-aware.svg` stays excluded, as nothing references it. A test asserts that every `resources/` file the source loads survives `.vscodeignore`, since only installing the packaged extension would otherwise reveal this.
- **The security audit never reported anything for yarn projects**: The Security column stayed empty for every yarn project, with no error shown.
  - Yarn classic: `yarn audit --json` prints newline-delimited JSON, one object per line. The parser ran a single `JSON.parse` over the whole output, which always threw, and the failure was swallowed into an empty result that was then cached.
  - Yarn 2+ ("berry"): `yarn audit` does not exist there at all (it is `yarn npm audit`), so the command failed outright and produced the same empty result. Berry projects are now detected from the `__metadata` block in `yarn.lock`, falling back to the presence of `.yarnrc.yml`, and get `yarn npm audit --json`.
  - Yarn reports one advisory per dependency path, so a package reachable three ways used to yield three identical entries. Advisories are now deduplicated, which keeps the per-package vulnerability count in the table honest.
  - The parser now detects the payload shape instead of trusting which package manager produced it, so all four known formats (npm 7+, npm 6/pnpm/berry, the legacy wrapper, and yarn's JSON lines) go through one path, and a future format change degrades to "no data" for that shape alone rather than for everything. Malformed entries no longer surface as `undefined` in the table: a missing severity reads as `info` and missing version ranges fall back instead of being dropped.
- **The security audit never reported anything for bun projects either**: The audit ran `bun audit` without `--json`, so bun printed a human-readable summary that no parser could read, and the failure was swallowed into an empty result. The command now asks for JSON, and the parser recognises the bulk advisory map (package name to advisories) that bun reports.
- **Bun projects created with Bun 1.2 or newer were treated as npm projects**: Bun replaced its binary `bun.lockb` lock file with the text `bun.lock`, and only the old name was recognised. A modern bun project therefore matched no lock file and fell through to the npm default, so the toolbar reported `npm`, the audit ran `npm audit`, and installing or updating a package ran `npm install` inside a bun project. Both lock file names are now recognised, and `PackageManagerInfo.lockFiles` accepts several names per manager so the next format change is a one-line addition.
- **Activity bar badge never appeared until the sidebar was opened at least once**: The pending-updates count now shows on the extension icon as soon as a workspace with a `package.json` is loaded.
  - Previously: two separate things blocked it. The extension only activated via `onCommand`/`onView`, so the background check did not run at startup; and the badge was applied to a `WebviewView`, an object that only exists once `resolveWebviewView` runs — which VS Code defers until the view first becomes visible. The net effect was that the count stayed invisible until the user clicked the activity bar icon, and invisible again after every restart in which they did not.
  - Now: the new `workspaceContains:**/package.json` activation event starts the background check in any Node project, and the badge moved to a sibling `TreeView` ("Updates"), created eagerly during activation, so it can be set without any view being opened.

### Added
- **"Updates" view** in the activity bar container, collapsed by default. It carries the badge and, when expanded, shows a single row with the workspace summary (available updates · vulnerable packages) that opens the manager when clicked. Its title is localized at runtime through the existing translations, so no `package.nls.*.json` files are needed.

### Changed
- The welcome view now shows a section header ("NPM VISUAL MANAGER"), which VS Code adds automatically once a container holds more than one view. Its contents and styling are unchanged.

## [1.8.2] - 2026-07-22

### Fixed
- **"Why is it installed?" reporting "dependencies are not installed" for every package on pnpm 10**: The view now works on projects using pnpm 10+.
  - pnpm 10 changed `pnpm why --json` from a top-down `dependencies` tree to a bottom-up `dependents` format. The parser only understood the old shape, so it found no chains and the view mislabeled fully-installed projects as "not installed". The parser now handles both the pnpm 10+ and the legacy formats.
  - The "not installed" state is now determined from the presence of `node_modules` on disk rather than from an empty parse result, so a future package-manager output change can no longer cause this false positive.

## [1.8.1] - 2026-07-21

### Fixed
- **Activity bar badge stuck after updating a package**: The badge count no longer stays stale until the IDE is restarted.
  - Previously: The badge only recomputed via the `package.json` file watcher, which does not fire reliably for the atomic rewrites done by npm/yarn/pnpm (notably on Windows), so after updating a package the old count lingered until the extension reactivated.
  - Now: Package operations (update, update all, install, uninstall, rollback) explicitly request a badge recompute, so the count updates without depending on the file watcher.
- **"Why is it installed?" empty in workspaces and shared libraries**: The view no longer reports "No dependency chains found" for every package in certain projects.
  - Workspace subprojects: `npm ls`/`pnpm why` run from a subproject report the tree rooted at the monorepo root. The view now anchors to the current project's node, so its direct dependencies show as "Direct" instead of being prefixed by the project name.
  - Shared libraries without their own `node_modules` (dependencies installed by the consuming project): instead of a misleading "No dependency chains found", the view now explains that dependencies are not installed here and that installing them enables the analysis.
- **Stray horizontal scrollbar on the dependency table**: An unwanted horizontal scrollbar appeared at the bottom of the table (surfaced after the new "why is it installed?" button), even though the table fit fully and the bar scrolled nowhere. Since the table uses a fixed layout at 100% width it never needs horizontal scrolling, so the table wrapper now hides overflow on the x axis; the action column was also widened so its buttons fit comfortably.

## [1.8.0] - Unreleased

### Added
- **"Why is it installed?" view**: New hierarchy icon on each package row opens a modal showing the reverse dependency chains — which direct dependencies pull the package in, and through which intermediate packages.
  - Powered by the project's own package manager: `npm ls --all`, `yarn why`, or `pnpm why` (bun not supported yet)
  - Direct dependencies are labeled with a "Direct" badge
  - Useful to decide whether a package can be safely removed or which parent needs updating to get rid of a vulnerable transitive version
- **Activity Bar Badge**: The extension icon in the activity bar now shows a badge with the number of available updates, computed in the background on startup — no need to open the panel to know if something needs attention. Vulnerable package count is shown in the badge tooltip.
  - Aggregates every project in the workspace (multi-root and monorepos included), so the number can be higher than the panel's counter, which shows a single project
  - Ignored packages and local/workspace/git dependencies are excluded from the update count
  - Vulnerabilities are detected via the package manager's audit run per project (so projects with their own lockfile are covered) and matched against direct dependencies
  - Refreshes automatically when any `package.json` changes or the ignore list is edited
  - Can be disabled with the new `npm-visual-manager.badge.enabled` setting

## [1.7.2] - 2026-05-11

### Fixed
- **Package manager version showing "npmvunknown" on Windows**
  - Previously: The toolbar badge displayed `npm`/`yarn`/`pnpm`/`bun` followed by `vunknown` because `resolveExecutable` (Unix-only: relies on `which`, `$SHELL`, and `~/.nvm`-style paths) returned `null` on Windows, and `getPackageManagerVersion` bailed out without trying the bare command.
  - Now: When `resolveExecutable` cannot locate the binary, the service falls back to the bare command name (`npm --version`, etc.), which resolves via PATH on typical Windows installs — matching the behavior already used for `getNodeVersion`.

## [1.7.1] - 2026-05-08

### Fixed
- **npm not found on Linux with nvm** (Resolves issue #6)
  - Previously: Users who installed Node via nvm/fnm/volta and launched VS Code from the desktop got `/bin/sh: 1: npm: not found` when updating packages.
  - Now: The extension automatically resolves the absolute path of package manager binaries (`npm`, `yarn`, `pnpm`, `bun`, `node`) before running commands.
  - Resolution order:
    1. User's login shell (`bash -lc "which npm"`) — loads nvm and other version managers automatically.
    2. Common installation directories: nvm (`~/.nvm/versions/node/...`), fnm, Volta, asdf, and system paths.
  - If a binary still cannot be found, a helpful hint is printed in the Output channel explaining the PATH issue and how to fix it.

## [1.7.0] - 2026-04-30

### Added
- **Vulnerability Details**: Click the warning icon on any package with known vulnerabilities to view details and open the official advisory directly. Closes #5.
  - Extracts real advisory URLs from `npm audit` output (npm v6, v7+, and yarn)
  - Modal shows severity level and advisory title for each vulnerability
  - "View Advisory" button opens the official advisory page (GitHub Advisories / npm) in your default browser
  - Works even when no update is available yet, so users can assess whether manual action is needed

## [1.6.3] - 2026-04-15

### Fixed
- **Size column sorting**: Fixed incorrect sorting in the dependency table size column.
  - Previously: Sizes were sorted alphabetically as formatted strings (e.g. `1 MB` < `100 B`, `10 KB` < `9 KB`).
  - Now: Sizes are parsed to bytes and compared numerically, so the order reflects actual package sizes correctly.
- **Installed column overflow**: Long local package paths no longer overflow into the "Latest" column. Text is now truncated with ellipsis and shows the full path on hover.
- **Local packages stuck on "checking..."**: Packages with local/workspace/git versions (`file:`, `link:`, `workspace:`, `github:`, etc.) no longer get stuck in "checking..." state in the "Latest" and "Last Update" columns. These packages now display "-" with a tooltip explaining that registry checks are skipped for local packages.

## [1.6.2] - 2026-04-08

### Fixed
- Version bump to 1.6.2

## [1.6.0] - 2026-03-31

### Fixed
- **Multi-root Workspace Support**: Resolves issue #2
  - Previously: Only the first workspace folder was scanned, so projects in other roots were never shown
  - Now: All workspace folders in a `.code-workspace` are scanned and their packages are listed together
  - Also fixed: Subdirectories with a `package.json` are now recursed into, so nested packages inside monorepo workspaces are correctly detected

## [1.5.0] - 2026-03-30

### Added
- **Version Picker**: Complete redesign of the update experience
  - New modal interface when clicking "Update" button
  - Shows all available versions from the registry (not just `latest`)
  - Two main options:
    - `latest` (dist-tag): Resolves to whatever the registry considers latest
    - Specific versions: Select exact version number to install
  - Semantic version ordering (highest version first, e.g., 10.1.0, 10.0.3, 9.39.4)
  - Release type grouping:
    - **Stable versions**: Always shows at least 10 stable releases
    - **Pre-release versions**: Collapsible section for alpha, beta, rc, dev builds
    - Badge indicators: "latest", "pre-release", "deprecated"
  - Perfect for private registries (Artifactory, Verdaccio) where `latest` tag may lag
- **--save-exact Support**: Pin exact versions without `^` or `~` prefix
  - New setting: `npm-visual-manager.saveExact` (default: `false`)
  - Per-operation checkbox in version picker modal
  - Visual indicator with pin icon 📌
  - Works with all package managers:
    - npm: `--save-exact`
    - yarn: `--exact`
    - pnpm: `--save-exact`
    - bun: `--exact`
- **Enhanced Version Display**: Improved version selection UI
  - Wider modal (550px max-width) for better readability
  - Version publish dates shown (e.g., "8 days ago", "1 month ago")
  - Radio button selection for precise version picking
  - "Show more/less" button for pre-release versions

### Changed
- **Update Button Behavior**: Now opens version picker instead of immediately updating to `latest`
- **Version Sorting**: Changed from date-based to semantic version ordering
  - Ensures 10.0.3 appears before 9.39.4 (higher version first)
  - Pre-release versions (with `-alpha`, `-beta`, `-dev`) sorted separately

### Fixed
- **Private Registry Support**: Resolves issue #1
  - Previously: Extension always resolved `latest` dist-tag, causing issues when private registries had outdated tags
  - Now: Users can select specific versions directly from the registry
  - Example: Install `vite@8.0.3` even if Artifactory's `latest` points to `8.0.1`

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
