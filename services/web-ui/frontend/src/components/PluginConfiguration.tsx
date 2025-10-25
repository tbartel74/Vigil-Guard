import React, { useState, useEffect } from 'react';
import * as api from '../lib/api';

export function PluginConfiguration() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [guiUrl, setGuiUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

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
      setGuiUrl(data.guiUrl || '');
      setEnabled(data.enabled !== undefined ? data.enabled : true);
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
    if (!webhookUrl || !guiUrl) {
      setMessage({ type: 'error', text: 'Webhook URL and GUI URL are required' });
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
        body: JSON.stringify({ webhookUrl, guiUrl, enabled })
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
        <h1 className="text-2xl font-semibold text-white">Web Browser Plugin Configuration</h1>
        <p className="text-text-secondary mt-2">Configure settings for the Vigil Guard browser extension</p>
      </div>

      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Connection Settings */}
          <div className="pb-6 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Connection Settings</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="webhookUrl" className="block text-sm font-medium text-slate-300 mb-2">
                  Webhook URL
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

              <div>
                <label htmlFor="guiUrl" className="block text-sm font-medium text-slate-300 mb-2">
                  GUI URL
                </label>
                <input
                  id="guiUrl"
                  type="url"
                  value={guiUrl}
                  onChange={(e) => setGuiUrl(e.target.value)}
                  placeholder="http://localhost:80/ui"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-text-secondary mt-2">
                  Base URL where this Web UI is accessible. Plugin fetches configuration from this address.
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
              <label htmlFor="enabled" className="text-slate-300">
                Enable plugin integration
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
