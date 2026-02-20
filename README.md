# NPM Visual Manager

A Visual Studio Code extension that provides a visual interface for managing NPM dependencies, inspired by the NuGet Package Manager in Visual Studio.

![NPM Visual Manager Screenshot](https://via.placeholder.com/800x400?text=NPM+GUI+Manager+Screenshot)

## Features

- 📊 **Visual Dependency Table**: View all dependencies (production, development, and peer) in a clean, sortable table
- 🔄 **Version Checking**: Automatically checks for latest versions from the NPM registry
- ⬆️ **One-Click Updates**: Update individual packages or all outdated packages at once
- 🔍 **Filtering & Search**: Filter by dependency type and search by package name
- 🎨 **Theme-Aware UI**: Uses VS Code's native CSS variables for seamless integration with any theme
- ⚡ **Fast & Lightweight**: Built with React and Vite for optimal performance

## Requirements

- VS Code 1.85.0 or higher
- Node.js project with a `package.json` file
- NPM installed

## Installation

1. Install dependencies:
```bash
npm run install:all
```

2. Build the extension:
```bash
npm run vscode:prepublish
```

3. Press `F5` to open a new Extension Development Host window

4. Open a Node.js project and run the command `Open NPM Package Manager`

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

## Architecture

```
npm-visual-manager/
├── src/                          # Extension Host (Node.js)
│   ├── extension.ts              # Entry point
│   ├── webviewPanel.ts           # Webview panel management
│   ├── npmService.ts             # NPM registry API
│   ├── packageService.ts         # package.json operations
│   └── types.ts                  # Shared types
├── webview-ui/                   # React Application
│   ├── src/
│   │   ├── components/           # React components
│   │   ├── hooks/                # Custom hooks
│   │   ├── App.tsx               # Main component
│   │   └── main.tsx              # Entry point
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── out/                          # Compiled output
│   ├── extension.js              # Compiled extension
│   └── webview/                  # Built React app
│       └── assets/
├── resources/                    # Icons and assets
└── package.json                  # Extension manifest
```

## Development

### Project Structure

- **Extension Host** (`src/`): Handles VS Code API, file system operations, and NPM registry communication
- **Webview UI** (`webview-ui/`): React application running inside the webview panel
- **Communication**: Uses `acquireVsCodeApi()` for bidirectional message passing

### Available Scripts

```bash
# Install all dependencies
npm run install:all

# Build everything for production
npm run vscode:prepublish

# Build webview in development mode
npm run build:webview:dev

# Watch TypeScript compilation
npm run watch
```

### Message Protocol

**Webview → Host:**
- `GET_DEPENDENCIES`: Request package.json dependencies
- `CHECK_UPDATES`: Request version check for dependencies
- `UPDATE_PACKAGE`: Request single package update
- `UPDATE_ALL_PACKAGES`: Request batch update

**Host → Webview:**
- `DEPENDENCIES_DATA`: Send dependency list
- `VERSION_CHECK_RESULT`: Send latest version for a package
- `UPDATE_RESULT`: Confirm update initiation
- `PROGRESS`: Show progress message
- `ERROR`: Report errors

## Extension Settings

Currently, this extension does not contribute any settings. Future versions may include:

- Registry URL configuration
- Update check interval
- Default version prefix preference (^, ~, exact)

## Known Issues

- Progress tracking during `npm install` is limited (terminal opens but progress isn't streamed back)
- Large projects with many dependencies may take time to check all versions

## Roadmap

- [ ] Support for Yarn and pnpm
- [ ] Install new packages via search interface
- [ ] Semantic versioning suggestions
- [ ] Vulnerability checking via `npm audit`
- [ ] Bulk select with checkboxes
- [ ] Export dependency report

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Inspired by Visual Studio's NuGet Package Manager
- Uses VS Code Webview UI Toolkit design principles
- Built with React and Vite
