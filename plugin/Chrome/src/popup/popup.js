// Vigil Guard Plugin - Status Popup (v0.6.0)
// Displays connection status and configuration info
// All configuration is managed from Web UI

// DOM Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const versionEl = document.getElementById('version');
const webhookStatusEl = document.getElementById('webhook-status');
const refreshBtn = document.getElementById('refresh-config');

/**
 * Initialize popup
 * Loads config from storage and displays status
 */
async function initialize() {
  console.log('[Vigil Guard] Popup initializing');

  // Display version from manifest
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = manifest.version;

  // Load config from storage
  const { config } = await chrome.storage.local.get('config');

  if (config) {
    updateDisplay(config);
    updateStatus('connected');
  } else {
    updateStatus('not-configured');
  }
}

/**
 * Update display with configuration info
 */
function updateDisplay(config) {
  // Display webhook status
  if (config.n8nEndpoint || config.webhookUrl) {
    webhookStatusEl.textContent = 'Configured ✓';
    webhookStatusEl.style.color = '#4ade80'; // green
  } else {
    webhookStatusEl.textContent = 'Missing ✗';
    webhookStatusEl.style.color = '#f87171'; // red
  }

  // Display enabled status
  if (config.enabled === false) {
    webhookStatusEl.textContent = 'Disabled';
    webhookStatusEl.style.color = '#9ca3af'; // gray
  }
}

/**
 * Update status indicator
 */
function updateStatus(state) {
  switch (state) {
    case 'connected':
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Connected';
      break;
    case 'not-configured':
      statusDot.className = 'status-dot inactive';
      statusText.textContent = 'Not Configured';
      break;
    case 'refreshing':
      statusDot.className = 'status-dot refreshing';
      statusText.textContent = 'Refreshing...';
      break;
    case 'error':
      statusDot.className = 'status-dot error';
      statusText.textContent = 'Connection Error';
      break;
  }
}

/**
 * Refresh configuration button handler
 * Triggers Service Worker to fetch latest config from GUI
 */
refreshBtn.addEventListener('click', async () => {
  console.log('[Vigil Guard] Manual refresh requested');
  updateStatus('refreshing');
  refreshBtn.disabled = true;

  try {
    // Send message to Service Worker to refresh config
    const response = await chrome.runtime.sendMessage({
      type: 'REFRESH_CONFIG'
    });

    if (response && response.success) {
      // Reload config from storage
      const { config } = await chrome.storage.local.get('config');

      if (config) {
        updateDisplay(config);
        updateStatus('connected');
      } else {
        updateStatus('not-configured');
      }
    } else {
      console.error('[Vigil Guard] Refresh failed:', response?.error);
      updateStatus('error');

      // Show error to user
      setTimeout(() => {
        const { config } = chrome.storage.local.get('config');
        if (config) {
          updateStatus('connected');
        } else {
          updateStatus('not-configured');
        }
      }, 3000);
    }
  } catch (error) {
    console.error('[Vigil Guard] Refresh error:', error);
    updateStatus('error');

    // Restore previous status after 3s
    setTimeout(async () => {
      const { config } = await chrome.storage.local.get('config');
      if (config) {
        updateStatus('connected');
      } else {
        updateStatus('not-configured');
      }
    }, 3000);
  } finally {
    refreshBtn.disabled = false;
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
