# NPM Visual Manager

A Visual Studio Code extension that provides a visual interface for managing NPM dependencies, inspired by the NuGet Package Manager in Visual Studio.

## Screenshots

### Ignore Packages & Show All Packages
Click the eye icon 👁️ to ignore packages from update checks. Use "Show All Packages" to toggle between outdated-only and all packages view.

![Ignore Packages](screenshots/ignore_package-show_all_packages.gif)

### Search & Install Packages
Search for new packages in the NPM registry and install them directly from the UI.

![Install Package](screenshots/install_package.gif)

### Update Packages
One-click updates for individual packages with automatic version checking.

![Update Package](screenshots/update_package.gif)

## Features

- **Dependency Management**: View production, development, and peer dependencies in a clean, sortable table.
- **Search & Install**: Integrated NPM registry search to install new packages directly from the UI.
- **Auto-Refresh**: Automatic UI reload when `package.json` is modified manually.
- **Robust Searching**: Real-time search with intelligent debouncing and request cancellation to prevent race conditions.
- **Changelog Viewer**: Direct links to GitHub releases for every package.
- **One-Click Operations**: Bulk or individual updates, uninstalls, and version rollbacks.
- **Multi-Project Support**: Auto-detects all project folders in monorepos.
- **Compatibility**: Supports npm, yarn, pnpm, and bun with automatic detection.
- **Security & Info**: Integrated security audit data, package sizes, and deprecation warnings.
- **Professional Integration**: Theme-aware UI using native VS Code styles and robust ESLint-verified code.
- **Multi-Language Support**: Automatic language detection with translations for Spanish, German, French, Chinese (Simplified), Japanese, Portuguese (Brazilian), Russian, and Korean.

## Requirements

- VS Code 1.85.0 or higher
- Node.js project with a `package.json` file
- Package manager installed (npm, yarn, pnpm, or bun)

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=LuisClementDev.npm-visual-manager) or search for "NPM Visual Manager" in the Extensions panel (`Ctrl+Shift+X`).

## Usage

### Opening the Package Manager

- **Command Palette**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and type "Open NPM Package Manager"
- **Context Menu**: Right-click on `package.json` in the Explorer and select "Open NPM Package Manager"

### Managing Dependencies

1. **View Dependencies**: The table shows all packages with their installed and latest versions
2. **Check for Updates**: The extension automatically checks npm registry for latest versions
3. **Update Packages**:
   - Click "Update" on individual packages
   - Use "Update All" button to update all outdated packages at once

### Filtering

- **Search**: Type in the filter box to search by package name
- **Type Filter**: Use the dropdown to show only Production, Development, or Peer dependencies

### Search & Install Packages

Expand the "INSTALL PACKAGES" section, type a package name (min. 2 characters), and click on a result to install it. You can choose to install as a regular dependency or dev dependency.

**Smart Detection**: When searching for a package that is already installed in your project, the button will change to "Uninstall" with a confirmation dialog.

### Ignore Packages

Click the eye icon 👁️ next to any package to ignore it from update checks. Ignored packages won't appear in the "updates available" counter. Click "Show All Packages" to toggle between viewing only outdated packages or all packages.

### Changelog Viewer

Hover over any package row and click the book icon 📖 to open the package's GitHub releases page. This helps you review what changed before updating.

## Architecture

```
npm-visual-manager/
├── src/                          # Extension Host (Node.js)
├── webview-ui/                   # React Application (Vite)
├── types/                        # Shared types between Host and Webview
├── out/                          # Compiled output
└── resources/                    # Icons and assets
```

## Extension Settings

This extension contributes the following settings:

- `npm-visual-manager.columns.size`: Show Size column
- `npm-visual-manager.columns.type`: Show Type column
- `npm-visual-manager.columns.lastUpdate`: Show Last Update column
- `npm-visual-manager.columns.security`: Show Security column
- `npm-visual-manager.columns.semverUpdate`: Show Update Type column

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Inspired by Visual Studio's NuGet Package Manager
- Uses VS Code Webview UI Toolkit design principles
- Built with React and Vite