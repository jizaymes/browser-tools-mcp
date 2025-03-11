// Import browser compatibility API
// This script provides a unified API for both Chrome and Firefox
// The variable browserAPI will be available globally

// Track URLs for each tab
const tabUrls = new Map();

// Listen for messages from the devtools panel
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_CURRENT_URL" && message.tabId) {
    getCurrentTabUrl(message.tabId)
      .then((url) => {
        sendResponse({ success: true, url: url });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Required to use sendResponse asynchronously
  }

  // Handle explicit request to update the server with the URL
  if (message.type === "UPDATE_SERVER_URL" && message.tabId && message.url) {
    console.log(
      `Background: Received request to update server with URL for tab ${message.tabId}: ${message.url}`
    );
    updateServerWithUrl(
      message.tabId,
      message.url,
      message.source || "explicit_update"
    )
      .then(() => {
        if (sendResponse) sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Background: Error updating server with URL:", error);
        if (sendResponse)
          sendResponse({ success: false, error: error.message });
      });
    return true; // Required to use sendResponse asynchronously
  }

  if (message.type === "CAPTURE_SCREENSHOT" && message.tabId) {
    // First get the server settings
    browserAPI.storage.local.get(["browserConnectorSettings"]).then(result => {
      const settings = result.browserConnectorSettings || {
        serverHost: "localhost",
        serverPort: 3025,
      };

      // Validate server identity first
      validateServerIdentity(settings.serverHost, settings.serverPort)
        .then((isValid) => {
          if (!isValid) {
            console.error(
              "Cannot capture screenshot: Not connected to a valid browser tools server"
            );
            sendResponse({
              success: false,
              error:
                "Not connected to a valid browser tools server. Please check your connection settings.",
            });
            return;
          }

          // Continue with screenshot capture
          captureAndSendScreenshot(message, settings, sendResponse);
        })
        .catch((error) => {
          console.error("Error validating server:", error);
          sendResponse({
            success: false,
            error: "Failed to validate server identity: " + error.message,
          });
        });
    });
    return true; // Required to use sendResponse asynchronously
  }
});

// Validate server identity
async function validateServerIdentity(host, port) {
  try {
    const response = await fetch(`http://${host}:${port}/.identity`, {
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!response.ok) {
      console.error(`Invalid server response: ${response.status}`);
      return false;
    }

    const identity = await response.json();

    // Validate the server signature
    if (identity.signature !== "mcp-browser-connector-24x7") {
      console.error("Invalid server signature - not the browser tools server");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error validating server identity:", error);
    return false;
  }
}

// Helper function to process the tab and run the audit
function processTabForAudit(tab, tabId) {
  const url = tab.url;

  if (!url) {
    console.error(`No URL available for tab ${tabId}`);
    return;
  }

  // Update our cache and the server with this URL
  tabUrls.set(tabId, url);
  updateServerWithUrl(tabId, url);
}

// Function to get the current URL for a tab
async function getCurrentTabUrl(tabId) {
  try {
    console.log("Background: Getting URL for tab", tabId);

    // First check if we have it cached
    if (tabUrls.has(tabId)) {
      const cachedUrl = tabUrls.get(tabId);
      console.log("Background: Found cached URL:", cachedUrl);
      return cachedUrl;
    }

    // Otherwise get it from the tab
    try {
      const tab = await browserAPI.tabs.get(tabId);
      if (tab && tab.url) {
        // Cache the URL
        tabUrls.set(tabId, tab.url);
        console.log("Background: Got URL from tab:", tab.url);
        return tab.url;
      } else {
        console.log("Background: Tab exists but no URL found");
      }
    } catch (tabError) {
      console.error("Background: Error getting tab:", tabError);
    }

    // If we can't get the tab directly, try querying for active tabs
    try {
      const tabs = await browserAPI.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs && tabs.length > 0 && tabs[0].url) {
        const activeUrl = tabs[0].url;
        console.log("Background: Got URL from active tab:", activeUrl);
        // Cache this URL as well
        tabUrls.set(tabId, activeUrl);
        return activeUrl;
      }
    } catch (queryError) {
      console.error("Background: Error querying tabs:", queryError);
    }

    console.log("Background: Could not find URL for tab", tabId);
    return null;
  } catch (error) {
    console.error("Background: Error getting tab URL:", error);
    return null;
  }
}

// Listen for tab updates to detect page refreshes and URL changes
browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Track URL changes
  if (changeInfo.url) {
    console.log(`URL changed in tab ${tabId} to ${changeInfo.url}`);
    tabUrls.set(tabId, changeInfo.url);

    // Send URL update to server if possible
    updateServerWithUrl(tabId, changeInfo.url, "tab_url_change");
  }

  // Check if this is a page refresh (status becoming "complete")
  if (changeInfo.status === "complete") {
    // Update URL in our cache
    if (tab.url) {
      tabUrls.set(tabId, tab.url);
      // Send URL update to server if possible
      updateServerWithUrl(tabId, tab.url, "page_complete");
    }

    retestConnectionOnRefresh(tabId);
  }
});

// Listen for tab activation (switching between tabs)
browserAPI.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  console.log(`Tab activated: ${tabId}`);

  // Get the URL of the newly activated tab
  browserAPI.tabs.get(tabId).then(tab => {
    if (tab && tab.url) {
      console.log(`Tab ${tabId} activated with URL: ${tab.url}`);
      updateServerWithUrl(tabId, tab.url, "tab_activated");
    }
  }).catch(error => {
    console.error("Error getting tab info:", error);
  });
});

// Function to update the server with the current URL
async function updateServerWithUrl(tabId, url, source = "background_update") {
  try {
    if (!url || url === "about:blank" || url.startsWith("chrome://") || url.startsWith("about:")) {
      console.log(`Background: Skipping non-web URL update for tab ${tabId}: ${url}`);
      return;
    }

    console.log(`Background: Updating server with URL for tab ${tabId}: ${url} (Source: ${source})`);

    // Get server settings
    const result = await browserAPI.storage.local.get(["browserConnectorSettings"]);
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };

    // Try to get the title as well
    let title = "";
    try {
      const tab = await browserAPI.tabs.get(tabId);
      title = tab.title || "";
    } catch (error) {
      console.error("Error getting tab title:", error);
    }

    // Send the update to the server
    const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/update-url`;
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tabId: tabId.toString(),
        url: url,
        title: title,
        source: source,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Background: Server response to URL update:", data);
    return data;
  } catch (error) {
    console.error(`Background: Failed to update server with URL for tab ${tabId}:`, error);
    throw error;
  }
}

// Clean up when tabs are closed
browserAPI.tabs.onRemoved.addListener((tabId) => {
  tabUrls.delete(tabId);
});

// Function to retest connection when a page is refreshed
async function retestConnectionOnRefresh(tabId) {
  try {
    console.log(`Retesting connection for tab ${tabId} on page refresh`);

    // Get settings
    const result = await browserAPI.storage.local.get(["browserConnectorSettings"]);
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };

    // Validate the server
    const isValid = await validateServerIdentity(settings.serverHost, settings.serverPort);
    
    // If server is valid, get the current URL and update the server
    if (isValid) {
      const url = await getCurrentTabUrl(tabId);
      if (url) {
        await updateServerWithUrl(tabId, url, "page_refresh");
      }
    } else {
      console.log("Server validation failed during refresh retest");
    }
  } catch (error) {
    console.error("Error during refresh retest:", error);
  }
}

// Function to capture and send screenshot
async function captureAndSendScreenshot(message, settings, sendResponse) {
  try {
    // Get the tab
    const tab = await browserAPI.tabs.get(message.tabId);
    
    // Find the window containing the tab
    const windows = await browserAPI.windows.getAll({ populate: true });
    const targetWindow = windows.find(w => 
      w.tabs && w.tabs.some(t => t.id === message.tabId)
    );

    if (!targetWindow) {
      throw new Error("Could not find window containing the inspected tab");
    }

    // Capture screenshot
    const dataUrl = await browserAPI.tabs.captureVisibleTab(targetWindow.id, { format: "png" });
    
    // Send the screenshot to the server
    const response = await fetch(`http://${settings.serverHost}:${settings.serverPort}/screenshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: dataUrl,
        path: message.screenshotPath,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }

    console.log("Screenshot saved successfully:", result.path);
    sendResponse({
      success: true,
      path: result.path,
      title: tab.title || "Current Tab"
    });
  } catch (error) {
    console.error("Error capturing screenshot:", error);
    sendResponse({
      success: false,
      error: error.message || "Failed to capture screenshot",
    });
  }
}
