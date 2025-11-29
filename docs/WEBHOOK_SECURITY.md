# Webhook Security Guide

## Overview

Vigil Guard uses Header Authentication to secure the n8n webhook endpoint. This prevents unauthorized access to the detection pipeline and ensures only trusted clients (browser plugins, test suite, external systems) can submit prompts for analysis.

## Authentication Method: Header Auth

| Property | Value |
|----------|-------|
| Method | Header Authentication |
| Header Name | `X-Vigil-Auth` |
| Token Length | 32 characters |
| Token Source | Generated in Web UI |

### Why Header Auth?

- **Simple**: Single token in HTTP header
- **Secure**: No session management needed
- **Compatible**: Works with browser plugins, test suites, and external systems
- **Rotatable**: Easy to change token if compromised

## Token Location

The webhook authentication token is stored in a single location:

| Component | Location | Access |
|-----------|----------|--------|
| Token File | `/config/.webhook-token` | Backend only |
| Web UI | Configuration → Webhook and Plugin | Admin users (view, copy, regenerate) |
| Browser Plugin | Fetched from `/api/plugin-config` | Auto-configured |
| Test Suite | Read from `/api/plugin-config` | CI/CD pipelines |

## Initial Setup (REQUIRED)

After installation, you must generate a webhook token and configure n8n:

### Step 1: Generate Token in Web UI

1. **Open Web UI** at `http://localhost/ui`
2. **Login** with admin credentials
3. **Navigate to** Configuration → **Webhook and Plugin**
4. **Click "Regenerate"** button to generate a new token
5. **Click "Copy"** to copy the token to clipboard

### Step 2: Configure n8n Webhook Node

1. **Open n8n** at `http://localhost:5678`

2. **Open the Vigil Guard workflow** in the editor

3. **Click on the "Webhook" node** (first node in the pipeline)

4. **Set Authentication**:
   - Find the "Authentication" dropdown
   - Select **"Header Auth"**

5. **Create New Credential**:
   - Click "Create New Credential"
   - **Name**: `X-Vigil-Auth`
   - **Value**: Paste the token you copied from Web UI

6. **Save the Credential**

7. **Save the Workflow**

8. **Activate the Workflow** (toggle switch in top-right)

### Visual Guide

```
┌─────────────────────────────────────────────────────────────┐
│  n8n Webhook Node Configuration                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Authentication: [Header Auth ▼]                            │
│                                                             │
│  Credential:     [X-Vigil-Auth ▼] [+ Create]               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Name:  X-Vigil-Auth                                │   │
│  │  Value: abc123...xyz789 (your token from Web UI)    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Token Rotation

If you need to rotate the token (e.g., suspected compromise):

### Step 1: Generate New Token in Web UI

1. Open Web UI → Configuration → Webhook and Plugin
2. Click **"Regenerate"** button
3. Confirm the action
4. Copy the new token

### Step 2: Update n8n Credential

1. Open n8n → Credentials
2. Edit "X-Vigil-Auth" credential
3. Update Value with new token
4. Save

**Note**: Browser plugins will automatically fetch the new token within 5 minutes.

## Troubleshooting

### Error: HTTP 401 Unauthorized

**Cause**: Token mismatch or missing token

**Solutions**:
1. Verify token in Web UI matches n8n credential
2. Check n8n Webhook node has Header Auth enabled
3. Ensure workflow is activated
4. Check browser plugin has latest config (refresh extension)

### Error: Token shows "(not configured)"

**Cause**: No token has been generated yet

**Solutions**:
1. Open Web UI → Configuration → Webhook and Plugin
2. Click "Regenerate" to generate a token
3. Copy and configure in n8n

### Browser Plugin Not Sending Token

**Cause**: Plugin hasn't fetched latest config

**Solutions**:
1. Open plugin popup → Check "Configured" status
2. Click browser extension icon to refresh
3. Check `chrome://extensions` → Service Worker logs

## Security Best Practices

1. **Never commit tokens** to version control
2. **Use different tokens** for dev/staging/production
3. **Rotate tokens** periodically (recommended: every 90 days)
4. **Monitor webhook access** via ClickHouse logs
5. **Use HTTPS** in production deployments

## Related Documentation

- [Installation Guide](./operations/installation.md)
- [Security Guide](./SECURITY.md)
- [Browser Extension](./plugin/BROWSER_EXTENSION.md)
- [API Reference](./api/web-api.md)
