import React, { useState, useEffect } from 'react';
import * as api from '../lib/api';
import descriptions from '../spec/descriptions.json';
import Tooltip from './Tooltip';

export function RetentionPolicy() {
  const [config, setConfig] = useState<api.RetentionConfig | null>(null);
  const [diskUsage, setDiskUsage] = useState<api.DiskUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  // Form values (editable)
  const [eventsRawTtl, setEventsRawTtl] = useState<number>(90);
  const [eventsProcessedTtl, setEventsProcessedTtl] = useState<number>(365);
  const [warnThreshold, setWarnThreshold] = useState<number>(80);
  const [criticalThreshold, setCriticalThreshold] = useState<number>(90);

  // Load config and disk usage on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configData, diskData] = await Promise.all([
        api.getRetentionConfig(),
        api.getRetentionDiskUsage()
      ]);

      setConfig(configData.config);
      setDiskUsage(diskData);

      // Set form values from config
      setEventsRawTtl(configData.config.events_raw_ttl_days);
      setEventsProcessedTtl(configData.config.events_processed_ttl_days);
      setWarnThreshold(configData.config.warn_disk_usage_percent);
      setCriticalThreshold(configData.config.critical_disk_usage_percent);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to load retention policy' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      // Validation
      if (eventsRawTtl < 1 || eventsRawTtl > 3650) {
        throw new Error('events_raw TTL must be between 1 and 3650 days');
      }
      if (eventsProcessedTtl < 1 || eventsProcessedTtl > 3650) {
        throw new Error('events_processed TTL must be between 1 and 3650 days');
      }
      if (warnThreshold >= criticalThreshold) {
        throw new Error('Warning threshold must be less than critical threshold');
      }

      const updates: Partial<api.RetentionConfig> = {
        events_raw_ttl_days: eventsRawTtl,
        events_processed_ttl_days: eventsProcessedTtl,
        warn_disk_usage_percent: warnThreshold,
        critical_disk_usage_percent: criticalThreshold
      };

      const response = await api.updateRetentionConfig(updates);
      setConfig(response.config);
      setMessage({ type: 'success', text: 'Retention policy updated successfully! TTL changes will apply to new data partitions.' });

      // Reload disk usage after successful save
      const diskData = await api.getRetentionDiskUsage();
      setDiskUsage(diskData);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update retention policy' });
    } finally {
      setSaving(false);
    }
  };

  const handleForceCleanup = async (table: 'events_raw' | 'events_processed' | 'all') => {
    if (!confirm(`Are you sure you want to force cleanup for ${table === 'all' ? 'all tables' : table}? This will immediately delete expired data.`)) {
      return;
    }

    setCleaning(true);
    setMessage(null);

    try {
      const response = await api.forceRetentionCleanup(table);
      setMessage({ type: 'success', text: response.message });

      // Reload disk usage
      const diskData = await api.getRetentionDiskUsage();
      setDiskUsage(diskData);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to execute cleanup' });
    } finally {
      setCleaning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Calculate disk usage status
  const diskUsagePercent = diskUsage?.system.used_percent || 0;
  const diskUsageStatus = diskUsagePercent >= criticalThreshold
    ? 'critical'
    : diskUsagePercent >= warnThreshold
      ? 'warning'
      : 'healthy';

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Data Retention Policy</h1>
        <p className="text-text-secondary mt-2">Configure automatic data cleanup and monitor disk usage</p>
      </div>

      {/* Messages */}
      {message && (
        <div className={`mb-6 px-4 py-3 rounded-lg ${message.type === 'success'
          ? 'bg-green-500/10 border border-green-500/30 text-green-300'
          : message.type === 'error'
            ? 'bg-red-500/10 border border-red-500/30 text-red-300'
            : 'bg-blue-500/10 border border-blue-500/30 text-blue-300'
          }`}>
          {message.text}
        </div>
      )}

      {/* System Disk Usage Overview */}
      <div className="mb-6 bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">System Disk Usage</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Total Space</div>
            <div className="text-xl font-semibold text-white">{diskUsage?.system.total_space_human || 'N/A'}</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Used Space</div>
            <div className="text-xl font-semibold text-white">{diskUsage?.system.used_space_human || 'N/A'}</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Free Space</div>
            <div className="text-xl font-semibold text-white">{diskUsage?.system.free_space_human || 'N/A'}</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Usage %</div>
            <div className={`text-xl font-semibold ${diskUsageStatus === 'critical'
              ? 'text-red-400'
              : diskUsageStatus === 'warning'
                ? 'text-yellow-400'
                : 'text-green-400'
              }`}>
              {diskUsagePercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-4 bg-slate-900 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${diskUsageStatus === 'critical'
                ? 'bg-red-500'
                : diskUsageStatus === 'warning'
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
                }`}
              style={{ width: `${Math.min(diskUsagePercent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>0%</span>
            <span className="text-yellow-400">{warnThreshold}% Warning</span>
            <span className="text-red-400">{criticalThreshold}% Critical</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Table-Level Disk Usage */}
      <div className="mb-6 bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Table Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {diskUsage?.tables.map((table) => (
            <div key={table.table_name} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <h3 className="font-semibold text-white mb-3">{table.table_name}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Rows:</span>
                  <span className="text-white font-mono">{table.total_rows.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Disk Size:</span>
                  <span className="text-white font-mono">{table.total_bytes_human}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Compressed:</span>
                  <span className="text-white font-mono">{table.compressed_bytes_human}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Compression Ratio:</span>
                  <span className="text-white font-mono">{table.compression_ratio}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Partitions:</span>
                  <span className="text-white font-mono">{table.partition_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Date Range:</span>
                  <span className="text-white font-mono text-xs">{table.oldest_partition} - {table.newest_partition}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Retention Configuration */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <form onSubmit={handleSave}>
          <h2 className="text-lg font-semibold text-white mb-4">Retention Policy Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* events_raw TTL */}
            <div>
              <label htmlFor="eventsRawTtl" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                events_raw TTL (days)
                {(descriptions as any)['RETENTION_EVENTS_RAW_TTL'] && (
                  <Tooltip
                    title={(descriptions as any)['RETENTION_EVENTS_RAW_TTL'].title}
                    description={(descriptions as any)['RETENTION_EVENTS_RAW_TTL'].description}
                    impact={(descriptions as any)['RETENTION_EVENTS_RAW_TTL'].impact}
                    category={(descriptions as any)['RETENTION_EVENTS_RAW_TTL'].category}
                  >
                    <div className="w-3 h-3 rounded-full bg-slate-700 text-text-secondary text-xs flex items-center justify-center cursor-help">
                      ?
                    </div>
                  </Tooltip>
                )}
              </label>
              <input
                id="eventsRawTtl"
                type="number"
                min="1"
                max="3650"
                value={eventsRawTtl}
                onChange={(e) => setEventsRawTtl(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-text-secondary mt-2">
                Raw webhook inputs (debug data). Recommended: 90 days. Current: {config?.events_raw_ttl_days} days.
              </p>
            </div>

            {/* events_processed TTL */}
            <div>
              <label htmlFor="eventsProcessedTtl" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                events_processed TTL (days)
                {(descriptions as any)['RETENTION_EVENTS_PROCESSED_TTL'] && (
                  <Tooltip
                    title={(descriptions as any)['RETENTION_EVENTS_PROCESSED_TTL'].title}
                    description={(descriptions as any)['RETENTION_EVENTS_PROCESSED_TTL'].description}
                    impact={(descriptions as any)['RETENTION_EVENTS_PROCESSED_TTL'].impact}
                    category={(descriptions as any)['RETENTION_EVENTS_PROCESSED_TTL'].category}
                  >
                    <div className="w-3 h-3 rounded-full bg-slate-700 text-text-secondary text-xs flex items-center justify-center cursor-help">
                      ?
                    </div>
                  </Tooltip>
                )}
              </label>
              <input
                id="eventsProcessedTtl"
                type="number"
                min="1"
                max="3650"
                value={eventsProcessedTtl}
                onChange={(e) => setEventsProcessedTtl(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-text-secondary mt-2">
                Full analysis data (scoring, decisions). Recommended: 365 days. Current: {config?.events_processed_ttl_days} days.
              </p>
            </div>

            {/* Warning Threshold */}
            <div>
              <label htmlFor="warnThreshold" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                Warning Threshold (%)
                {(descriptions as any)['RETENTION_WARN_THRESHOLD'] && (
                  <Tooltip
                    title={(descriptions as any)['RETENTION_WARN_THRESHOLD'].title}
                    description={(descriptions as any)['RETENTION_WARN_THRESHOLD'].description}
                    impact={(descriptions as any)['RETENTION_WARN_THRESHOLD'].impact}
                    category={(descriptions as any)['RETENTION_WARN_THRESHOLD'].category}
                  >
                    <div className="w-3 h-3 rounded-full bg-slate-700 text-text-secondary text-xs flex items-center justify-center cursor-help">
                      ?
                    </div>
                  </Tooltip>
                )}
              </label>
              <input
                id="warnThreshold"
                type="number"
                min="1"
                max="100"
                value={warnThreshold}
                onChange={(e) => setWarnThreshold(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-text-secondary mt-2">
                Disk usage warning level. Current: {config?.warn_disk_usage_percent}%.
              </p>
            </div>

            {/* Critical Threshold */}
            <div>
              <label htmlFor="criticalThreshold" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                Critical Threshold (%)
                {(descriptions as any)['RETENTION_CRITICAL_THRESHOLD'] && (
                  <Tooltip
                    title={(descriptions as any)['RETENTION_CRITICAL_THRESHOLD'].title}
                    description={(descriptions as any)['RETENTION_CRITICAL_THRESHOLD'].description}
                    impact={(descriptions as any)['RETENTION_CRITICAL_THRESHOLD'].impact}
                    category={(descriptions as any)['RETENTION_CRITICAL_THRESHOLD'].category}
                  >
                    <div className="w-3 h-3 rounded-full bg-slate-700 text-text-secondary text-xs flex items-center justify-center cursor-help">
                      ?
                    </div>
                  </Tooltip>
                )}
              </label>
              <input
                id="criticalThreshold"
                type="number"
                min="1"
                max="100"
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-text-secondary mt-2">
                Disk usage critical level. Current: {config?.critical_disk_usage_percent}%.
              </p>
            </div>
          </div>

          {/* Audit Info */}
          {config && (
            <div className="mt-6 pt-6 border-t border-slate-700">
              <div className="text-sm text-slate-400 space-y-1">
                <div>Last modified: <span className="text-white">{new Date(config.last_modified_at).toLocaleString()}</span></div>
                <div>Modified by: <span className="text-white">{config.last_modified_by}</span></div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex justify-between items-center">
            <div className="space-x-2">
              <button
                type="button"
                onClick={() => handleForceCleanup('all')}
                disabled={cleaning}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cleaning ? 'Cleaning...' : 'Force Cleanup (All Tables)'}
              </button>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Retention Policy'}
            </button>
          </div>
        </form>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-blue-400 text-xl">ℹ</div>
          <div className="text-sm text-blue-300">
            <p className="font-semibold mb-2">How TTL Works</p>
            <ul className="list-disc list-inside space-y-1 text-blue-200">
              <li>TTL (Time To Live) automatically deletes data older than specified days</li>
              <li>Changes apply immediately to new partitions after save</li>
              <li>ClickHouse checks for expired data every hour (merge_with_ttl_timeout)</li>
              <li>Use "Force Cleanup" to immediately trigger deletion of expired data</li>
              <li>Partitions are dropped entirely for efficient space reclamation (ttl_only_drop_parts)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
