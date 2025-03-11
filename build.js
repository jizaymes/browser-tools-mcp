const fs = require('fs');
const path = require('path');

// Paths
const SHARED_DIR = path.join(__dirname, 'shared');
const CHROME_DIR = path.join(__dirname, 'chrome-extension');
const FIREFOX_DIR = path.join(__dirname, 'firefox-extension');
const OUTPUT_DIRS = [CHROME_DIR, FIREFOX_DIR];

// Ensure output directories exist
OUTPUT_DIRS.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Read base manifest
const baseManifest = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, 'manifest-base.json'), 'utf8'));

// Read browser-specific manifests
const chromeManifest = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, 'manifest-chrome.json'), 'utf8'));
const firefoxManifest = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, 'manifest-firefox.json'), 'utf8'));

// Merge manifests
const fullChromeManifest = mergeObjects(baseManifest, chromeManifest);
const fullFirefoxManifest = mergeObjects(baseManifest, firefoxManifest);

// Write combined manifests
fs.writeFileSync(path.join(CHROME_DIR, 'manifest.json'), JSON.stringify(fullChromeManifest, null, 2));
fs.writeFileSync(path.join(FIREFOX_DIR, 'manifest.json'), JSON.stringify(fullFirefoxManifest, null, 2));

// Copy browser abstraction layer to both extensions
fs.copyFileSync(path.join(SHARED_DIR, 'browser-api.js'), path.join(CHROME_DIR, 'browser-api.js'));
fs.copyFileSync(path.join(SHARED_DIR, 'browser-api.js'), path.join(FIREFOX_DIR, 'browser-api.js'));

// Copy shared HTML files if they exist
const htmlFiles = ['devtools.html', 'panel.html'];
htmlFiles.forEach(file => {
  const sharedFile = path.join(SHARED_DIR, file);
  if (fs.existsSync(sharedFile)) {
    fs.copyFileSync(sharedFile, path.join(CHROME_DIR, file));
    fs.copyFileSync(sharedFile, path.join(FIREFOX_DIR, file));
  }
});

console.log('Build completed successfully!');

// Helper function to merge objects with array concatenation for permissions
function mergeObjects(obj1, obj2) {
  const result = { ...obj1 };
  
  for (const key in obj2) {
    if (Array.isArray(obj1[key]) && Array.isArray(obj2[key])) {
      // Combine arrays without duplicates
      result[key] = [...new Set([...obj1[key], ...obj2[key]])];
    } else if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object' && !Array.isArray(obj1[key]) && !Array.isArray(obj2[key])) {
      // Recursive merge for nested objects
      result[key] = mergeObjects(obj1[key], obj2[key]);
    } else {
      // For simple values, obj2 overwrites obj1
      result[key] = obj2[key];
    }
  }
  
  return result;
}
