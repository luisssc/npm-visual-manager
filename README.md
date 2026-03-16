# NPM Visual Manager

[![Open VSX Version](https://img.shields.io/open-vsx/v/LuisClementDev/npm-visual-manager)](https://open-vsx.org/extension/LuisClementDev/npm-visual-manager)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/LuisClementDev/npm-visual-manager)](https://open-vsx.org/extension/LuisClementDev/npm-visual-manager)
[![Build Status](https://img.shields.io/github/actions/workflow/status/luisssc/npm-visual-manager/ci.yml?branch=main)](https://github.com/luisssc/npm-visual-manager/actions)
[![License](https://img.shields.io/github/license/luisssc/npm-visual-manager)](LICENSE)

A Visual Studio Code extension that provides a visual interface for managing NPM dependencies, inspired by the NuGet Package Manager in Visual Studio.

## Screenshots

![NPM Visual Manager Preview](screenshots/preview.gif)

## Features

| Category | Capabilities |
|----------|-------------|
| **Dependency Management** | Visual table with sorting, filtering by type (prod/dev/peer), auto-refresh on `package.json` changes |
| **Search & Install** | NPM registry search with debouncing, install as regular or dev dependency |
| **Updates** | One-click individual or bulk updates, version rollbacks, ignore packages from checks |
| **Security & Info** | Security audit integration, deprecation warnings, package sizes, direct links to changelogs |
| **Multi-Project** | Auto-detection in monorepos, supports npm, yarn, pnpm, and bun |
| **Localization** | 8 languages: Spanish, German, French, Chinese (Simplified), Japanese, Portuguese, Russian, Korean |
| **UI** | Native VS Code theme integration, customizable columns |

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