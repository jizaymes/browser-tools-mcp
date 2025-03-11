# BrowserTools MCP Cross-Browser Extension

This is a cross-browser compatible version of the BrowserTools MCP extension that works with both Chrome and Firefox. The extension allows AI code editors to capture data from a browser such as console logs, network requests, screenshots, and more.

## Architecture

The cross-browser extension is built using a modular approach:

1. **Shared Code**: Common code that works across browsers is stored in the `shared/` directory
2. **Browser Abstraction Layer**: The `browser-api.js` file provides a unified API that works in both Chrome and Firefox
3. **Browser-Specific Manifests**: Different manifest versions for each browser are combined from base parts

## Building the Extension

To build the extension for both browsers, run:

```bash
node build.js
```

This will:
1. Combine the base manifest with browser-specific manifests
2. Copy the browser abstraction layer to each extension directory
3. Copy the shared HTML and JavaScript files to each extension directory

## Installation

### Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked" and select the `chrome-extension` directory
4. The BrowserTools MCP extension should now be installed in Chrome

### Firefox

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Navigate to the `firefox-extension` directory and select the `manifest.json` file
4. The BrowserTools MCP extension should now be installed in Firefox

## Usage

1. Open DevTools in your browser (F12 or Cmd+Option+I on Mac)
2. Click on the "BrowserToolsMCP" tab in DevTools
3. Configure your settings and use the extension features:
   - Capture Screenshots
   - Monitor Console Logs
   - Track Network Requests
   - View Selected Elements

## How It Works

The extension uses a detection mechanism to determine which browser it's running in and provides an appropriate implementation:

```javascript
// From browser-api.js
const isFirefox = typeof browser !== 'undefined';
```

Firefox provides a `browser` namespace for its WebExtension API, while Chrome uses the `chrome` namespace. The abstraction layer normalizes these differences and provides a consistent API for the extension code.

## Configuration

Settings are stored in the browser's local storage and can be configured in the extension panel:

- Log Limit: Maximum number of log entries to keep
- Query Character Limit: Maximum size of query strings
- String Size Limit: Maximum size of string data
- Show Request/Response Headers: Toggle to include HTTP headers in logs
- Screenshot Path: Directory to save screenshots

## Troubleshooting

If you encounter issues:

1. Check that the browser connector server is running on `localhost:3025`
2. Verify that the extension has the necessary permissions
3. Check the console in DevTools for any error messages
4. Try reinstalling the extension

## Development

When modifying the extension:

1. Make changes to the shared files in the `shared/` directory
2. Run `node build.js` to rebuild the extension
3. Reload the extension in your browser(s)

For browser-specific features, you may need to modify the browser abstraction layer in `browser-api.js`.
