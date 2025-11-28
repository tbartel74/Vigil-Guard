import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import descriptions from '../spec/descriptions.json';
import Tooltip from './Tooltip';

export function PluginConfiguration() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [webhookAuthToken, setWebhookAuthToken] = useState('');
  const [webhookAuthHeader, setWebhookAuthHeader] = useState('X-Vigil-Auth');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

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
