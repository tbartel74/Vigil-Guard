import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import descriptions from '../spec/descriptions.json';
import Tooltip from './Tooltip';

interface BootstrapTokenStatus {
  token: string;
  createdAt: string;
  expiresAt: string;
  usedCount: number;
  maxUses: number;
  lastUsedAt: string | null;
  status: 'active' | 'expired' | 'not_configured' | 'exhausted';
}

export function PluginConfiguration() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [webhookAuthToken, setWebhookAuthToken] = useState('');
  const [webhookAuthHeader, setWebhookAuthHeader] = useState('X-Vigil-Auth');
  const [showToken, setShowToken] = useState(false);

  // Bootstrap token state
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapTokenStatus | null>(null);
  const [newBootstrapToken, setNewBootstrapToken] = useState<string | null>(null);
  const [generatingBootstrap, setGeneratingBootstrap] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchBootstrapStatus();
  }, []);

  const fetchBootstrapStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/ui/api/plugin-config/bootstrap-status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setBootstrapStatus(data);
      }
    } catch (error) {
      console.error('[Plugin Config] Failed to fetch bootstrap status:', error);
    }
  };

  const handleGenerateBootstrap = async () => {
    if (!confirm('Generate a new Bootstrap Token?\n\nThis token is required for browser extension initial setup.\nThe token will be shown ONCE - copy it immediately!')) {
      return;
    }

    setGeneratingBootstrap(true);
    setNewBootstrapToken(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/ui/api/plugin-config/generate-bootstrap', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate bootstrap token');
      }

      const result = await response.json();
      setNewBootstrapToken(result.token);
      setMessage({
        type: 'success',
        text: 'Bootstrap token generated! Copy it now - it will not be shown again.'
      });

      // Refresh status
      fetchBootstrapStatus();
    } catch (error: any) {
      console.error('[Plugin Config] Generate bootstrap error:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to generate bootstrap token' });
    } finally {
      setGeneratingBootstrap(false);
    }
  };

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/ui/api/plugin-config/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch configuration');
      }

      const data = await response.json();
      setWebhookUrl(data.webhookUrl || '');
      setEnabled(data.enabled !== undefined ? data.enabled : true);
      setWebhookAuthToken(data.webhookAuthToken || '');
      setWebhookAuthHeader(data.webhookAuthHeader || 'X-Vigil-Auth');
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to load configuration' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    // Validate inputs
    if (!webhookUrl) {
      setMessage({ type: 'error', text: 'Webhook URL is required' });
      setSaving(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/ui/api/plugin-config/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ webhookUrl, enabled })
      });

      // Read response as text first (can only read body once!)
      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = 'Failed to save configuration';
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (parseError) {
          // If response is not JSON, use raw text
          errorMessage = responseText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Parse successful response
      try {
        const result = JSON.parse(responseText);
        console.log('[Plugin Config] Save successful:', result);
      } catch (parseError) {
        console.log('[Plugin Config] Save successful (non-JSON response)');
      }

      setMessage({ type: 'success', text: 'Configuration saved successfully. Browser extension will auto-refresh within 5 minutes.' });
    } catch (error: any) {
      console.error('[Plugin Config] Save error:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!confirm('Are you sure you want to regenerate the webhook token?\n\nAfter regeneration, you MUST manually update the token in n8n Webhook node credentials.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/ui/api/plugin-config/regenerate-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to regenerate token');
      }

      const result = await response.json();
      setWebhookAuthToken(result.token);
      setShowToken(true); // Show the new token
      setMessage({
        type: 'success',
        text: 'New token generated! Copy it and update n8n Webhook node credentials.'
      });
    } catch (error: any) {
      console.error('[Plugin Config] Regenerate token error:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to regenerate token' });
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-text-secondary mt-4">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Webhook and Plugin</h1>
        <p className="text-text-secondary mt-2">Configure webhook security and browser extension settings</p>
      </div>

      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <form onSubmit={handleSave} className="space-y-6">

          {/* Bootstrap Token Section - BEFORE first plugin installation */}
          <div className="pb-6 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Plugin Initial Setup</h2>

            {/* Bootstrap Token Warning/Status */}
            {(!bootstrapStatus || bootstrapStatus.status === 'not_configured') && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-amber-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-300">
                      Bootstrap Token Required
                    </p>
                    <p className="text-sm text-amber-200 mt-1">
                      Before installing the browser extension, you must generate a Bootstrap Token.
                      This token allows the extension to securely retrieve webhook credentials on first connection.
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateBootstrap}
                      disabled={generatingBootstrap}
                      className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingBootstrap ? 'Generating...' : 'Generate Bootstrap Token'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {bootstrapStatus?.status === 'expired' && (
              <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-300">
                      Bootstrap Token Expired
                    </p>
                    <p className="text-sm text-red-200 mt-1">
                      The previous bootstrap token has expired. Generate a new one for new plugin installations.
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateBootstrap}
                      disabled={generatingBootstrap}
                      className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingBootstrap ? 'Generating...' : 'Generate New Bootstrap Token'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {bootstrapStatus?.status === 'exhausted' && (
              <div className="mb-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-purple-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-purple-300">
                      Bootstrap Token Used Successfully
                    </p>
                    <p className="text-sm text-purple-200 mt-1">
                      The bootstrap token was used {bootstrapStatus.usedCount}/{bootstrapStatus.maxUses} time(s) and is now exhausted.
                      {bootstrapStatus.lastUsedAt && (
                        <> Last used: {new Date(bootstrapStatus.lastUsedAt).toLocaleString()}.</>
                      )}
                      <br/>
                      To deploy additional browser extensions, generate a new token.
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateBootstrap}
                      disabled={generatingBootstrap}
                      className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingBootstrap ? 'Generating...' : 'Generate New Bootstrap Token'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {bootstrapStatus?.status === 'active' && (
              <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-green-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-300">
                      Bootstrap Token Active
                    </p>
                    <p className="text-sm text-green-200 mt-1">
                      Token expires: {new Date(bootstrapStatus.expiresAt).toLocaleString()}<br/>
                      Used: {bootstrapStatus.usedCount} time(s)
                      {bootstrapStatus.lastUsedAt && (
                        <> • Last used: {new Date(bootstrapStatus.lastUsedAt).toLocaleString()}</>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateBootstrap}
                      disabled={generatingBootstrap}
                      className="mt-3 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingBootstrap ? 'Generating...' : 'Regenerate Token'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Show newly generated token with Download Plugin button */}
            {/* Only show if token was just generated AND hasn't been used yet */}
            {newBootstrapToken && bootstrapStatus?.status === 'active' && (
              <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-blue-300">
                      Bootstrap Token Generated - Download Pre-configured Plugin
                    </p>
                    <p className="text-xs text-blue-200 mt-1 mb-3">
                      Click "Download Plugin" to get the extension with this token pre-configured.
                      Users just need to install it - no manual configuration required!
                    </p>

                    {/* Download Plugin Button - PRIMARY ACTION */}
                    <div className="mb-3">
                      <a
                        href={`/ui/api/plugin-config/download-plugin?token=${encodeURIComponent(newBootstrapToken)}`}
                        download="vigil-guard-plugin.zip"
                        className="inline-flex items-center px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition-colors"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Pre-configured Plugin (.zip)
                      </a>
                    </div>

                    <p className="text-xs text-amber-300 mt-2">
                      <strong>Note:</strong> This download link is single-use. After the plugin is installed and connects to the server, the token will be consumed and this link will no longer work.
                    </p>

                    {/* Alternative: Manual token copy */}
                    <details className="mt-3">
                      <summary className="text-xs text-blue-300 cursor-pointer hover:text-blue-200">
                        Advanced: Copy token for manual configuration or enterprise deployment
                      </summary>
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={newBootstrapToken}
                          readOnly
                          className="flex-1 px-3 py-2 bg-slate-900 border border-blue-500/50 rounded-lg text-blue-100 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(newBootstrapToken);
                            setMessage({ type: 'success', text: 'Bootstrap token copied to clipboard!' });
                            setTimeout(() => setMessage(null), 3000);
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-blue-200/70 mt-2">
                        Use this token in Chrome Managed Storage policy for enterprise MDM deployment.
                      </p>
                    </details>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Webhook Security Section */}
          <div className="pb-6 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Webhook Security</h2>

            {/* Warning Banner */}
            <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-300">
                    Manual n8n Configuration Required
                  </p>
                  <p className="text-sm text-yellow-200 mt-1">
                    After importing the workflow, you must configure Header Auth in the n8n Webhook node manually.
                    See <Link to="/help?doc=WEBHOOK_SECURITY.md" className="underline hover:text-yellow-100">documentation</Link> for instructions.
                  </p>
                </div>
              </div>
            </div>

            {/* Auth Header Name (read-only) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Authentication Header
              </label>
              <input
                type="text"
                value={webhookAuthHeader}
                readOnly
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-500 cursor-not-allowed"
              />
              <p className="text-xs text-text-secondary mt-2">
                HTTP header name for authentication (read-only)
              </p>
            </div>

            {/* Auth Token with actions */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Authentication Token
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={webhookAuthToken || '(not configured)'}
                    readOnly
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-300 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors"
                  title={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (webhookAuthToken) {
                      navigator.clipboard.writeText(webhookAuthToken);
                      setMessage({ type: 'success', text: 'Token copied to clipboard!' });
                      setTimeout(() => setMessage(null), 3000);
                    }
                  }}
                  disabled={!webhookAuthToken}
                  className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copy token to clipboard"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  className="px-3 py-2 text-sm bg-amber-600 hover:bg-amber-700 rounded-lg text-white transition-colors"
                  title="Generate new token (requires n8n update)"
                >
                  Regenerate
                </button>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Copy this token and paste it into n8n Webhook node credentials. After regenerating, you must update n8n manually.
              </p>
            </div>
          </div>

          {/* Connection Settings */}
          <div className="pb-6 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Connection Settings</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="webhookUrl" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                  Webhook URL
                  {(descriptions as any)['PLUGIN_WEBHOOK_URL'] && (
                    <Tooltip
                      title={(descriptions as any)['PLUGIN_WEBHOOK_URL'].title}
                      description={(descriptions as any)['PLUGIN_WEBHOOK_URL'].description}
                      impact={(descriptions as any)['PLUGIN_WEBHOOK_URL'].impact}
                      category={(descriptions as any)['PLUGIN_WEBHOOK_URL'].category}
                    >
                      <div className="w-3 h-3 rounded-full bg-slate-700 text-text-secondary text-xs flex items-center justify-center cursor-help">
                        ?
                      </div>
                    </Tooltip>
                  )}
                </label>
                <input
                  id="webhookUrl"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="http://localhost:80/ui/api/browser-filter"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-text-secondary mt-2">
                  Endpoint that browser extension uses to validate prompts. Plugin will auto-refresh this configuration every 5 minutes.
                </p>
              </div>
            </div>
          </div>

          {/* Plugin Status */}
          <div className="pb-6 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Plugin Status</h2>
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
              />
              <label htmlFor="enabled" className="text-slate-300 flex items-center gap-2">
                Enable plugin integration
                {(descriptions as any)['PLUGIN_ENABLED'] && (
                  <Tooltip
                    title={(descriptions as any)['PLUGIN_ENABLED'].title}
                    description={(descriptions as any)['PLUGIN_ENABLED'].description}
                    impact={(descriptions as any)['PLUGIN_ENABLED'].impact}
                    category={(descriptions as any)['PLUGIN_ENABLED'].category}
                  >
                    <div className="w-3 h-3 rounded-full bg-slate-700 text-text-secondary text-xs flex items-center justify-center cursor-help">
                      ?
                    </div>
                  </Tooltip>
                )}
              </label>
            </div>
            <p className="text-xs text-text-secondary mt-2 ml-8">
              When disabled, the browser extension will return "allow" for all requests (fail-open mode).
            </p>
          </div>

          {/* Info Section */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">Auto-Configuration</h3>
            <ul className="text-xs text-blue-200 space-y-1 list-disc list-inside">
              <li>Browser extension automatically fetches configuration on install</li>
              <li>Configuration refreshes every 5 minutes automatically</li>
              <li>Users can manually refresh using the "Refresh Configuration" button in plugin popup</li>
              <li>No manual configuration needed on user's side</li>
            </ul>
          </div>

          {/* Messages */}
          {message && (
            <div className={`px-4 py-3 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}>
              {message.text}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
