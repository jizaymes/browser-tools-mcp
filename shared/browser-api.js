/**
 * Browser API Compatibility Layer
 * 
 * This module provides a unified API for browser extensions that works across
 * Chrome and Firefox. It automatically detects the browser type and provides
 * the appropriate implementation.
 */

const browserAPI = (() => {
  // Check if we're running in Firefox (has browser namespace) or Chrome
  const isFirefox = typeof browser !== 'undefined';
  
  // Create a proxy to the appropriate browser API
  const api = isFirefox ? browser : chrome;

  // Helper function to handle callback vs promise-based APIs
  const promisify = (fn, ...args) => {
    // If Firefox, use native promises
    if (isFirefox) {
      return fn(...args);
    }
    
    // For Chrome, convert callback-based API to promises
    return new Promise((resolve, reject) => {
      fn(...args, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  };

  // Return public API with unified methods
  return {
    // Browser type info
    isFirefox,
    isChrome: !isFirefox,
    name: isFirefox ? 'firefox' : 'chrome',
    
    // Runtime
    runtime: {
      onMessage: {
        addListener: (callback) => api.runtime.onMessage.addListener(callback)
      },
      sendMessage: (message, options) => {
        if (isFirefox) {
          return api.runtime.sendMessage(message);
        } else {
          return new Promise((resolve, reject) => {
            api.runtime.sendMessage(message, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
        }
      }
    },
    
    // Storage
    storage: {
      local: {
        get: (keys) => {
          if (isFirefox) {
            return api.storage.local.get(keys);
          } else {
            return new Promise((resolve, reject) => {
              api.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(result);
                }
              });
            });
          }
        },
        set: (items) => {
          if (isFirefox) {
            return api.storage.local.set(items);
          } else {
            return new Promise((resolve, reject) => {
              api.storage.local.set(items, () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve();
                }
              });
            });
          }
        }
      }
    },
    
    // Tabs
    tabs: {
      get: (tabId) => {
        if (isFirefox) {
          return api.tabs.get(tabId);
        } else {
          return new Promise((resolve, reject) => {
            api.tabs.get(tabId, (tab) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(tab);
              }
            });
          });
        }
      },
      query: (queryInfo) => {
        if (isFirefox) {
          return api.tabs.query(queryInfo);
        } else {
          return new Promise((resolve, reject) => {
            api.tabs.query(queryInfo, (tabs) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(tabs);
              }
            });
          });
        }
      },
      captureVisibleTab: (windowId, options) => {
        if (isFirefox) {
          return api.tabs.captureVisibleTab(windowId, options);
        } else {
          return new Promise((resolve, reject) => {
            api.tabs.captureVisibleTab(windowId, options, (dataUrl) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(dataUrl);
              }
            });
          });
        }
      },
      onUpdated: {
        addListener: (callback) => api.tabs.onUpdated.addListener(callback)
      },
      onActivated: {
        addListener: (callback) => api.tabs.onActivated.addListener(callback)
      },
      onRemoved: {
        addListener: (callback) => api.tabs.onRemoved.addListener(callback)
      }
    },
    
    // Windows
    windows: {
      getAll: (getInfo) => {
        if (isFirefox) {
          return api.windows.getAll(getInfo);
        } else {
          return new Promise((resolve, reject) => {
            api.windows.getAll(getInfo, (windows) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(windows);
              }
            });
          });
        }
      }
    },
    
    // DevTools
    devtools: {
      inspectedWindow: {
        tabId: api.devtools?.inspectedWindow?.tabId
      },
      panels: {
        create: (...args) => api.devtools.panels.create(...args),
        elements: api.devtools?.panels?.elements
      }
    },
    
    // Debugger
    debugger: {
      attach: (target, version) => {
        if (isFirefox) {
          return api.debugger.attach(target, version);
        } else {
          return new Promise((resolve, reject) => {
            try {
              api.debugger.attach(target, version, () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve();
                }
              });
            } catch (e) {
              reject(e);
            }
          });
        }
      },
      detach: (target) => {
        if (isFirefox) {
          return api.debugger.detach(target);
        } else {
          return new Promise((resolve, reject) => {
            try {
              api.debugger.detach(target, () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve();
                }
              });
            } catch (e) {
              reject(e);
            }
          });
        }
      },
      sendCommand: (target, method, params) => {
        if (isFirefox) {
          return api.debugger.sendCommand(target, method, params);
        } else {
          return new Promise((resolve, reject) => {
            api.debugger.sendCommand(target, method, params, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(result);
              }
            });
          });
        }
      },
      onEvent: {
        addListener: (callback) => api.debugger.onEvent.addListener(callback)
      },
      onDetach: {
        addListener: (callback) => api.debugger.onDetach.addListener(callback)
      }
    }
  };
})();

// For compatibility with older code that might use browser or chrome directly
if (typeof window !== 'undefined') {
  window.browserCompatAPI = browserAPI;
}

// For module exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = browserAPI;
}
