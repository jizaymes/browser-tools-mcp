// Import browser compatibility API
// This ensures we have a unified browser API available

// Store settings
let settings = {
  logLimit: 50,
  queryLimit: 30000,
  stringSizeLimit: 500,
  showRequestHeaders: false,
  showResponseHeaders: false,
  maxLogSize: 20000,
  screenshotPath: "",
};

// Load saved settings on startup
browserAPI.storage.local.get(["browserConnectorSettings"]).then(result => {
  if (result.browserConnectorSettings) {
    settings = { ...settings, ...result.browserConnectorSettings };
    updateUIFromSettings();
  }
}).catch(error => {
  console.error("Error loading settings:", error);
});

// Initialize UI elements
document.addEventListener("DOMContentLoaded", () => {
  const logLimitInput = document.getElementById("log-limit");
  const queryLimitInput = document.getElementById("query-limit");
  const stringSizeLimitInput = document.getElementById("string-size-limit");
  const showRequestHeadersCheckbox = document.getElementById(
    "show-request-headers"
  );
  const showResponseHeadersCheckbox = document.getElementById(
    "show-response-headers"
  );
  const maxLogSizeInput = document.getElementById("max-log-size");
  const screenshotPathInput = document.getElementById("screenshot-path");
  const captureScreenshotButton = document.getElementById("capture-screenshot");
  const wipeLogsButton = document.getElementById("wipe-logs");

  // Initialize collapsible advanced settings
  const advancedSettingsHeader = document.getElementById(
    "advanced-settings-header"
  );
  const advancedSettingsContent = document.getElementById(
    "advanced-settings-content"
  );
  const chevronIcon = advancedSettingsHeader.querySelector(".chevron");

  if (advancedSettingsHeader && advancedSettingsContent && chevronIcon) {
    advancedSettingsHeader.addEventListener("click", () => {
      advancedSettingsContent.classList.toggle("visible");
      chevronIcon.classList.toggle("open");
    });
  }

  // Update UI from settings
  function updateUIFromSettings() {
    if (logLimitInput) logLimitInput.value = settings.logLimit;
    if (queryLimitInput) queryLimitInput.value = settings.queryLimit;
    if (stringSizeLimitInput) stringSizeLimitInput.value = settings.stringSizeLimit;
    if (showRequestHeadersCheckbox) showRequestHeadersCheckbox.checked = settings.showRequestHeaders;
    if (showResponseHeadersCheckbox) showResponseHeadersCheckbox.checked = settings.showResponseHeaders;
    if (maxLogSizeInput) maxLogSizeInput.value = settings.maxLogSize;
    if (screenshotPathInput) screenshotPathInput.value = settings.screenshotPath;
  }

  // Update UI immediately
  updateUIFromSettings();

  // Save settings
  function saveSettings() {
    browserAPI.storage.local.set({ browserConnectorSettings: settings }).then(() => {
      console.log("Settings saved successfully");
      
      // Notify devtools.js about settings change
      browserAPI.runtime.sendMessage({
        type: "SETTINGS_UPDATED",
        settings,
      }).catch(error => {
        console.error("Error notifying about settings update:", error);
      });
    }).catch(error => {
      console.error("Error saving settings:", error);
    });
  }

  // Add event listeners for all inputs
  if (logLimitInput) {
    logLimitInput.addEventListener("change", (e) => {
      settings.logLimit = parseInt(e.target.value, 10);
      saveSettings();
    });
  }

  if (queryLimitInput) {
    queryLimitInput.addEventListener("change", (e) => {
      settings.queryLimit = parseInt(e.target.value, 10);
      saveSettings();
    });
  }

  if (stringSizeLimitInput) {
    stringSizeLimitInput.addEventListener("change", (e) => {
      settings.stringSizeLimit = parseInt(e.target.value, 10);
      saveSettings();
    });
  }

  if (showRequestHeadersCheckbox) {
    showRequestHeadersCheckbox.addEventListener("change", (e) => {
      settings.showRequestHeaders = e.target.checked;
      saveSettings();
    });
  }

  if (showResponseHeadersCheckbox) {
    showResponseHeadersCheckbox.addEventListener("change", (e) => {
      settings.showResponseHeaders = e.target.checked;
      saveSettings();
    });
  }

  if (maxLogSizeInput) {
    maxLogSizeInput.addEventListener("change", (e) => {
      settings.maxLogSize = parseInt(e.target.value, 10);
      saveSettings();
    });
  }

  if (screenshotPathInput) {
    screenshotPathInput.addEventListener("change", (e) => {
      settings.screenshotPath = e.target.value;
      saveSettings();
    });
  }

  // Screenshot capture functionality
  if (captureScreenshotButton) {
    captureScreenshotButton.addEventListener("click", () => {
      captureScreenshotButton.textContent = "Capturing...";

      // Get current tab ID from devtools
      const tabId = browserAPI.devtools.inspectedWindow.tabId;

      // Send message to background script to capture screenshot
      browserAPI.runtime.sendMessage({
        type: "CAPTURE_SCREENSHOT",
        tabId: tabId,
        screenshotPath: settings.screenshotPath
      }).then(response => {
        console.log("Screenshot capture response:", response);
        if (!response) {
          captureScreenshotButton.textContent = "Failed to capture!";
          console.error("Screenshot capture failed: No response received");
        } else if (!response.success) {
          captureScreenshotButton.textContent = "Failed to capture!";
          console.error("Screenshot capture failed:", response.error);
        } else {
          captureScreenshotButton.textContent = `Captured: ${response.title}`;
          console.log("Screenshot captured successfully:", response.path);
        }
        setTimeout(() => {
          captureScreenshotButton.textContent = "Capture Screenshot";
        }, 2000);
      }).catch(error => {
        console.error("Error capturing screenshot:", error);
        captureScreenshotButton.textContent = "Failed to capture!";
        setTimeout(() => {
          captureScreenshotButton.textContent = "Capture Screenshot";
        }, 2000);
      });
    });
  }

  // Wipe logs functionality
  if (wipeLogsButton) {
    wipeLogsButton.addEventListener("click", () => {
      browserAPI.storage.local.get(["browserConnectorSettings"]).then(result => {
        const settings = result.browserConnectorSettings || {
          serverHost: "localhost",
          serverPort: 3025,
        };
        
        fetch(`http://${settings.serverHost}:${settings.serverPort}/wipelogs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
          .then((response) => response.json())
          .then((result) => {
            console.log("Logs wiped successfully:", result.message);
            wipeLogsButton.textContent = "Logs Wiped!";
            setTimeout(() => {
              wipeLogsButton.textContent = "Wipe All Logs";
            }, 2000);
          })
          .catch((error) => {
            console.error("Failed to wipe logs:", error);
            wipeLogsButton.textContent = "Failed to Wipe Logs";
            setTimeout(() => {
              wipeLogsButton.textContent = "Wipe All Logs";
            }, 2000);
          });
      }).catch(error => {
        console.error("Error getting server settings for wiping logs:", error);
        wipeLogsButton.textContent = "Failed to Wipe Logs";
        setTimeout(() => {
          wipeLogsButton.textContent = "Wipe All Logs";
        }, 2000);
      });
    });
  }
});
