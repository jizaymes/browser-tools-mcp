// Import browser compatibility API first
// This ensures we have a unified browser API available before any other code runs

// Store settings with defaults
let settings = {
  logLimit: 50,
  queryLimit: 30000,
  stringSizeLimit: 500,
  maxLogSize: 20000,
  showRequestHeaders: false,
  showResponseHeaders: false,
  screenshotPath: "", // Add new setting for screenshot path
};

// Keep track of debugger state
let isDebuggerAttached = false;
let attachDebuggerRetries = 0;
const currentTabId = browserAPI.devtools.inspectedWindow.tabId;
const MAX_ATTACH_RETRIES = 3;
const ATTACH_RETRY_DELAY = 1000; // 1 second

// Load saved settings on startup
browserAPI.storage.local.get(["browserConnectorSettings"]).then(result => {
  if (result.browserConnectorSettings) {
    settings = { ...settings, ...result.browserConnectorSettings };
  }
}).catch(error => {
  console.error("Error loading settings:", error);
});

// Listen for settings updates
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SETTINGS_UPDATED") {
    settings = message.settings;
  }
});

// Utility to recursively truncate strings in any data structure
function truncateStringsInData(data, maxLength, depth = 0, path = "") {
  // Add depth limit to prevent circular references
  if (depth > 100) {
    console.warn("Max depth exceeded at path:", path);
    return "[MAX_DEPTH_EXCEEDED]";
  }

  console.log(`Processing at path: ${path}, type:`, typeof data);

  if (typeof data === "string") {
    if (data.length > maxLength) {
      console.log(
        `Truncating string at path ${path} from ${data.length} to ${maxLength}`
      );
      return data.substring(0, maxLength) + "... (truncated)";
    }
    return data;
  }

  if (Array.isArray(data)) {
    console.log(`Processing array at path ${path} with length:`, data.length);
    return data.map((item, index) =>
      truncateStringsInData(item, maxLength, depth + 1, `${path}[${index}]`)
    );
  }

  if (typeof data === "object" && data !== null) {
    console.log(
      `Processing object at path ${path} with keys:`,
      Object.keys(data)
    );
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      try {
        result[key] = truncateStringsInData(
          value,
          maxLength,
          depth + 1,
          path ? `${path}.${key}` : key
        );
      } catch (e) {
        console.error(`Error processing key ${key} at path ${path}:`, e);
        result[key] = "[ERROR_PROCESSING]";
      }
    }
    return result;
  }

  return data;
}

// Helper to calculate the size of an object
function calculateObjectSize(obj) {
  return JSON.stringify(obj).length;
}

// Helper to process array of objects with size limit
function processArrayWithSizeLimit(array, maxTotalSize, processFunc) {
  let currentSize = 0;
  const result = [];

  for (const item of array) {
    // Process the item first
    const processedItem = processFunc(item);
    const itemSize = calculateObjectSize(processedItem);

    // Check if adding this item would exceed the limit
    if (currentSize + itemSize > maxTotalSize) {
      console.log(
        `Reached size limit (${currentSize}/${maxTotalSize}), truncating array`
      );
      break;
    }

    // Add item and update size
    result.push(processedItem);
    currentSize += itemSize;
    console.log(
      `Added item of size ${itemSize}, total size now: ${currentSize}`
    );
  }

  return result;
}

// Modified processJsonString to handle arrays with size limit
function processJsonString(jsonString, maxLength) {
  console.log("Processing string of length:", jsonString?.length);
  try {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
      console.log(
        "Successfully parsed as JSON, structure:",
        JSON.stringify(Object.keys(parsed))
      );
    } catch (e) {
      console.log("Not valid JSON, treating as string");
      return truncateStringsInData(jsonString, maxLength, 0, "root");
    }

    // If it's an array, process with size limit
    if (Array.isArray(parsed)) {
      console.log("Processing array of objects with size limit");
      const processed = processArrayWithSizeLimit(
        parsed,
        settings.maxLogSize,
        (item) => truncateStringsInData(item, maxLength, 0, "root")
      );
      const result = JSON.stringify(processed);
      console.log(
        `Processed array: ${parsed.length} -> ${processed.length} items`
      );
      return result;
    }

    // Otherwise process as before
    const processed = truncateStringsInData(parsed, maxLength, 0, "root");
    const result = JSON.stringify(processed);
    console.log("Processed JSON string length:", result.length);
    return result;
  } catch (e) {
    console.error("Error in processJsonString:", e);
    return jsonString.substring(0, maxLength) + "... (truncated)";
  }
}

// Helper to send logs to browser-connector
function sendToBrowserConnector(logData) {
  if (!logData) {
    console.error("No log data provided to sendToBrowserConnector");
    return;
  }

  console.log("Sending log data to browser connector:", {
    type: logData.type,
    timestamp: logData.timestamp,
  });

  // Process any string fields that might contain JSON
  const processedData = { ...logData };

  if (logData.type === "network-request") {
    console.log("Processing network request");
    if (processedData.requestBody) {
      console.log(
        "Request body size before:",
        processedData.requestBody.length
      );
      processedData.requestBody = processJsonString(
        processedData.requestBody,
        settings.stringSizeLimit
      );
      console.log("Request body size after:", processedData.requestBody.length);
    }
    if (processedData.responseBody) {
      console.log(
        "Response body size before:",
        processedData.responseBody.length
      );
      processedData.responseBody = processJsonString(
        processedData.responseBody,
        settings.stringSizeLimit
      );
      console.log(
        "Response body size after:",
        processedData.responseBody.length
      );
    }
    
    // Don't send headers if they're not enabled
    if (!settings.showRequestHeaders && processedData.requestHeaders) {
      delete processedData.requestHeaders;
    }
    if (!settings.showResponseHeaders && processedData.responseHeaders) {
      delete processedData.responseHeaders;
    }
  }

  // Get server settings
  browserAPI.storage.local.get(["browserConnectorSettings"]).then(result => {
    const storedSettings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };

    const serverUrl = `http://${storedSettings.serverHost}:${storedSettings.serverPort}/log`;
    fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(processedData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("Log sent successfully:", data);
      })
      .catch((error) => {
        console.error("Error sending log:", error);
      });
  }).catch(error => {
    console.error("Error getting server settings:", error);
  });
}

// Function to wipe logs
function wipeLogs() {
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
      })
      .catch((error) => {
        console.error("Failed to wipe logs:", error);
      });
  }).catch(error => {
    console.error("Error getting server settings for wiping logs:", error);
  });
}

// Add function to wipe logs
wipeLogs();

// Attach debugger
async function attachDebugger() {
  // Avoid double-attaching
  if (isDebuggerAttached) {
    console.log("Debugger already attached");
    return;
  }

  const target = { tabId: currentTabId };
  console.log("Attaching debugger to", target);

  try {
    await browserAPI.debugger.attach(target, "1.3");
    console.log("Debugger attached successfully!");
    isDebuggerAttached = true;
    attachDebuggerRetries = 0;

    // Enable network tracking
    await browserAPI.debugger.sendCommand(target, "Network.enable");
    console.log("Network tracking enabled");

    // Enable runtime
    await browserAPI.debugger.sendCommand(target, "Runtime.enable");
    console.log("Runtime tracking enabled");

    // Enable console API
    await browserAPI.debugger.sendCommand(target, "Console.enable");
    console.log("Console tracking enabled");

    // Listen for console messages via DevTools Protocol
    browserAPI.debugger.onEvent.addListener(function (debuggeeId, method, params) {
      if (debuggeeId.tabId !== currentTabId) return;

      if (method === "Console.messageAdded") {
        console.log("Console event:", method, params);
        consoleMessageListener(
          params.message.source,
          params.message.level,
          params.message
        );
      } else if (method === "Runtime.consoleAPICalled") {
        console.log("Runtime console event:", method, params);
        const timestamp = new Date().toISOString();
        
        let args = [];
        if (params.args && params.args.length) {
          args = params.args.map(arg => {
            if (arg.type === 'string') {
              return arg.value;
            } else if (arg.type === 'object' && arg.preview) {
              return JSON.stringify(arg.preview);
            } else {
              return String(arg.value);
            }
          });
        }

        sendToBrowserConnector({
          type: "console-log",
          level: params.type,
          source: "console-api",
          timestamp: timestamp,
          message: args.join(' '),
          params: JSON.stringify(params)
        });
      } else if (method === "Network.requestWillBeSent") {
        handleNetworkRequest(params);
      } else if (method === "Network.responseReceived") {
        handleNetworkResponse(params);
      } else if (method === "Network.loadingFinished") {
        handleNetworkFinished(params);
      } else if (method === "Network.loadingFailed") {
        handleNetworkFailed(params);
      }
    });

    // Notify about successful connection
    sendToBrowserConnector({
      type: "connection",
      status: "connected",
      timestamp: new Date().toISOString(),
      tabId: currentTabId,
    });
  } catch (error) {
    console.error("Failed to attach debugger:", error);
    isDebuggerAttached = false;

    // Retry logic with exponential backoff
    if (attachDebuggerRetries < MAX_ATTACH_RETRIES) {
      attachDebuggerRetries++;
      const delay = ATTACH_RETRY_DELAY * Math.pow(2, attachDebuggerRetries - 1);
      console.log(`Retrying debugger attach in ${delay}ms (attempt ${attachDebuggerRetries})`);
      setTimeout(performAttach, delay);
    } else {
      console.error("Max attach retries reached, giving up");
    }
  }
}

// Separate function to allow for retries
function performAttach() {
  attachDebugger().catch(error => {
    console.error("Error in performAttach:", error);
  });
}

// Helper function to detach debugger
async function detachDebugger() {
  if (!isDebuggerAttached) return;

  const target = { tabId: currentTabId };
  try {
    await browserAPI.debugger.detach(target);
    console.log("Debugger detached");
    isDebuggerAttached = false;
  } catch (error) {
    console.error("Error detaching debugger:", error);
    // If the error is because the debugging connection was closed already, 
    // we can consider it detached
    isDebuggerAttached = false;
  }
}

// Move the console message listener outside the panel creation
function consoleMessageListener(source, level, message) {
  console.log(`Console message: ${source} [${level}]`, message);

  // Send to browser connector
  sendToBrowserConnector({
    type: "console-log",
    level: level,
    source: source,
    timestamp: new Date().toISOString(),
    message: message.text || JSON.stringify(message),
  });
}

// Network request handling functions
function handleNetworkRequest(params) {
  console.log("Network request:", params.requestId, params.request.url);
  
  // Store request info to match with response later
  const timestamp = new Date().toISOString();
  
  sendToBrowserConnector({
    type: "network-request",
    event: "request-started",
    timestamp: timestamp,
    requestId: params.requestId,
    url: params.request.url,
    method: params.request.method,
    requestHeaders: settings.showRequestHeaders ? params.request.headers : undefined,
    requestBody: params.request.postData,
    tabId: currentTabId
  });
}

function handleNetworkResponse(params) {
  console.log("Network response:", params.requestId, params.response.status);
  
  const timestamp = new Date().toISOString();
  
  sendToBrowserConnector({
    type: "network-request",
    event: "response-received",
    timestamp: timestamp,
    requestId: params.requestId,
    url: params.response.url,
    status: params.response.status,
    statusText: params.response.statusText,
    responseHeaders: settings.showResponseHeaders ? params.response.headers : undefined,
    mimeType: params.response.mimeType,
    tabId: currentTabId
  });
  
  // For text responses, try to get the response body
  if (params.response.mimeType.includes("text") || 
      params.response.mimeType.includes("json") || 
      params.response.mimeType.includes("application/javascript")) {
    
    const target = { tabId: currentTabId };
    browserAPI.debugger.sendCommand(
      target,
      "Network.getResponseBody",
      { requestId: params.requestId }
    ).then(result => {
      if (result && result.body) {
        sendToBrowserConnector({
          type: "network-request",
          event: "response-body",
          timestamp: new Date().toISOString(),
          requestId: params.requestId,
          url: params.response.url,
          responseBody: result.body,
          tabId: currentTabId
        });
      }
    }).catch(error => {
      console.log("Error getting response body:", error);
    });
  }
}

function handleNetworkFinished(params) {
  console.log("Network request finished:", params.requestId);
  
  sendToBrowserConnector({
    type: "network-request",
    event: "request-completed",
    timestamp: new Date().toISOString(),
    requestId: params.requestId,
    tabId: currentTabId
  });
}

function handleNetworkFailed(params) {
  console.log("Network request failed:", params.requestId, params.errorText);
  
  sendToBrowserConnector({
    type: "network-request",
    event: "request-failed",
    timestamp: new Date().toISOString(),
    requestId: params.requestId,
    error: params.errorText,
    tabId: currentTabId
  });
}

// Function to capture and send element data
async function captureAndSendElement() {
  try {
    // Execute a script in the inspected window to get the selection
    const result = await new Promise((resolve) => {
      browserAPI.devtools.inspectedWindow.eval(
        `(function() {
          const selection = document.getSelection();
          if (selection && selection.toString().trim() !== '') {
            return {
              type: 'selection',
              text: selection.toString(),
              html: selection.anchorNode ? selection.anchorNode.parentElement.outerHTML : null
            };
          }
          
          // If there's an element in the devtools elements panel, this will be available
          if (typeof $0 !== 'undefined' && $0) {
            const computedStyle = window.getComputedStyle($0);
            const styles = {};
            for (let i = 0; i < computedStyle.length; i++) {
              const prop = computedStyle[i];
              styles[prop] = computedStyle.getPropertyValue(prop);
            }
            
            return {
              type: 'element',
              tagName: $0.tagName,
              id: $0.id,
              classes: Array.from($0.classList),
              html: $0.outerHTML,
              computedStyle: styles
            };
          }
          
          return null;
        })()`,
        (result, isException) => {
          if (isException) {
            console.error("Error getting selected element:", isException);
            resolve(null);
          } else {
            resolve(result);
          }
        }
      );
    });

    if (result) {
      console.log("Selected element/text:", result);
      
      // Send to browser connector
      sendToBrowserConnector({
        type: "element-selected",
        timestamp: new Date().toISOString(),
        element: result,
        tabId: currentTabId
      });
    }
  } catch (error) {
    console.error("Error capturing element:", error);
  }
}

// Use DevTools Protocol to capture console logs
browserAPI.devtools.panels.create(
  "BrowserToolsMCP", 
  "", 
  "panel.html", 
  (panel) => {
    // Initial attach - we'll keep the debugger attached as long as DevTools is open
    attachDebugger();

    // Update URL when showing panel
    panel.onShown.addListener(() => {
      browserAPI.runtime.sendMessage({
        type: "GET_CURRENT_URL",
        tabId: currentTabId
      }).then(response => {
        if (response && response.success && response.url) {
          console.log("Current URL:", response.url);
        }
      }).catch(error => {
        console.error("Error getting URL:", error);
      });
    });

    // Reattach debugger when panel is shown (in case it was detached)
    panel.onShown.addListener(() => {
      if (!isDebuggerAttached) {
        attachDebugger();
      }
    });
  }
);

// Listen for element selection in the Elements panel
if (browserAPI.devtools.panels.elements?.onSelectionChanged) {
  browserAPI.devtools.panels.elements.onSelectionChanged.addListener(() => {
    captureAndSendElement();
  });
}

// WebSocket for real-time communication
let ws = null;

// Set up WebSocket connection
function setupWebSocket() {
  browserAPI.storage.local.get(["browserConnectorSettings"]).then(result => {
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };
    
    const wsUrl = `ws://${settings.serverHost}:${settings.serverPort}/ws`;
    
    // Close existing connection if any
    if (ws) {
      ws.close();
    }
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log("WebSocket connection established");
      ws.send(JSON.stringify({
        type: "register",
        tabId: currentTabId,
        source: "devtools"
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("WS message received:", message);
        
        // Handle commands from the server
        if (message.type === "command" && message.command === "wipe-logs") {
          wipeLogs();
        }
      } catch (e) {
        console.error("Error processing websocket message:", e);
      }
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    
    ws.onclose = () => {
      console.log("WebSocket connection closed");
      // Try to reconnect after a delay
      setTimeout(setupWebSocket, 5000);
    };
  }).catch(error => {
    console.error("Error getting server settings for WebSocket:", error);
    // Retry after delay
    setTimeout(setupWebSocket, 5000);
  });
}

// Initialize WebSocket connection when DevTools opens
setupWebSocket();

// Clean up WebSocket when DevTools closes
window.addEventListener("unload", () => {
  if (ws) {
    ws.close();
  }
  
  // Detach debugger
  detachDebugger();
});
