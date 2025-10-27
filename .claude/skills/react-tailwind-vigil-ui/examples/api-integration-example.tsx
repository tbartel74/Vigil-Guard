/**
 * Complete API Integration Example
 *
 * Demonstrates fetching, editing, and saving configuration
 * with ETag concurrency control and error handling.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

interface ConfigData {
  threshold_allow_max: number;
  threshold_sanitize_light_max: number;
  threshold_block_min: number;
  test_mode: boolean;
}

export default function ConfigurationPage() {
  const { user } = useAuth();

  // State
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [etag, setEtag] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  // Fetch configuration on mount
  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    setLoading(true);
    setError('');

    try {
      // GET /api/parse/unified_config.json
      const response = await api.get('/api/parse/unified_config.json');

      // Store ETag for concurrency control
      setEtag(response.headers['etag'] || '');

      // Extract thresholds from response
      const data = response.data;
      setConfig({
        threshold_allow_max: data.thresholds.allow_max,
        threshold_sanitize_light_max: data.thresholds.sanitize_light_max,
        threshold_block_min: data.thresholds.block_min,
        test_mode: data.test_mode || false
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setError('');

    try {
      // POST /api/save with ETag validation
      await api.post('/api/save', {
        name: 'unified_config.json',
        content: {
          thresholds: {
            allow_max: config.threshold_allow_max,
            sanitize_light_max: config.threshold_sanitize_light_max,
            block_min: config.threshold_block_min
          },
          test_mode: config.test_mode
        },
        etag: etag,
        username: user?.username || 'anonymous'
      });

      alert('Configuration saved successfully!');

      // Reload to get new ETag
      await loadConfiguration();
    } catch (err: any) {
      if (err.response?.status === 412) {
        // 412 Precondition Failed = ETag mismatch
        setError('Configuration was modified by another user. Please refresh.');
      } else if (err.response?.status === 401) {
        // 401 Unauthorized = Token expired
        window.location.href = '/login';
      } else {
        setError(err.response?.data?.message || 'Failed to save configuration');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof ConfigData, value: any) => {
    if (!config) return;

    setConfig({
      ...config,
      [field]: value
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
        <p className="text-red-400">Failed to load configuration</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-text-primary mb-6">
        Detection Thresholds
      </h1>

      {error && (
        <div className="bg-red-900/20 border border-red-600 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      <div className="bg-surface-dark border border-border-subtle rounded-lg p-6 space-y-6">
        {/* Allow Threshold */}
        <div>
          <label className="block text-text-secondary mb-2">
            Allow Threshold (0-29)
          </label>
          <input
            type="number"
            min="0"
            max="29"
            value={config.threshold_allow_max}
            onChange={(e) => handleChange('threshold_allow_max', Number(e.target.value))}
            className="bg-surface-darker border border-border-subtle text-text-primary rounded-md px-3 py-2 w-full"
          />
          <p className="text-text-muted text-sm mt-1">
            Prompts scoring 0-{config.threshold_allow_max} will be allowed
          </p>
        </div>

        {/* Sanitize Light Threshold */}
        <div>
          <label className="block text-text-secondary mb-2">
            Sanitize Light Threshold (30-64)
          </label>
          <input
            type="number"
            min="30"
            max="64"
            value={config.threshold_sanitize_light_max}
            onChange={(e) => handleChange('threshold_sanitize_light_max', Number(e.target.value))}
            className="bg-surface-darker border border-border-subtle text-text-primary rounded-md px-3 py-2 w-full"
          />
          <p className="text-text-muted text-sm mt-1">
            Prompts scoring {config.threshold_allow_max + 1}-{config.threshold_sanitize_light_max} will be lightly sanitized
          </p>
        </div>

        {/* Block Threshold */}
        <div>
          <label className="block text-text-secondary mb-2">
            Block Threshold (85-100)
          </label>
          <input
            type="number"
            min="85"
            max="100"
            value={config.threshold_block_min}
            onChange={(e) => handleChange('threshold_block_min', Number(e.target.value))}
            className="bg-surface-darker border border-border-subtle text-text-primary rounded-md px-3 py-2 w-full"
          />
          <p className="text-text-muted text-sm mt-1">
            Prompts scoring {config.threshold_block_min}+ will be blocked
          </p>
        </div>

        {/* Test Mode Toggle */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="test_mode"
            checked={config.test_mode}
            onChange={(e) => handleChange('test_mode', e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-surface-darker border-border-subtle rounded"
          />
          <label htmlFor="test_mode" className="ml-2 text-text-secondary">
            Enable Test Mode (bypass all blocking)
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-md transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          <button
            onClick={loadConfiguration}
            disabled={saving}
            className="bg-surface-darker hover:bg-surface-dark border border-border-subtle text-text-primary px-6 py-2 rounded-md transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ETag Info (for debugging) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 text-xs text-text-muted">
          ETag: {etag || 'none'}
        </div>
      )}
    </div>
  );
}
