import React, { useState, useEffect } from 'react';
import { getConfigVersions, rollbackToVersion, type ConfigVersion } from '../lib/api';

interface VersionHistoryModalProps {
  onClose: () => void;
  onRollbackSuccess?: () => void;
}

export default function VersionHistoryModal({ onClose, onRollbackSuccess }: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollbackingTag, setRollbackingTag] = useState<string | null>(null);
  const [rollbackSuccess, setRollbackSuccess] = useState(false);

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const data = await getConfigVersions();
      setVersions(data.versions || []);
    } catch (err: any) {
      setError('Failed to load version history: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (tag: string) => {
    if (!confirm(`Are you sure you want to rollback to version "${tag}"? This will restore all configuration files from that version.`)) {
      return;
    }

    try {
      setRollbackingTag(tag);
      setError(null);
      await rollbackToVersion(tag);
      setRollbackSuccess(true);

      // Show success message briefly
      setTimeout(() => {
        setRollbackSuccess(false);
        onClose();
        if (onRollbackSuccess) {
          onRollbackSuccess();
        }
      }, 2000);
    } catch (err: any) {
      setError('Rollback failed: ' + err.message);
    } finally {
      setRollbackingTag(null);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-4xl mx-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Configuration Version History</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {rollbackSuccess && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
            Rollback successful! Configuration restored.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-400">Loading version history...</div>
            </div>
          ) : versions.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-400">No version history available</div>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version) => (
                <div
                  key={version.tag}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-white font-mono text-sm">{version.tag}</span>
                        <span className="text-slate-400 text-xs">{formatTimestamp(version.timestamp)}</span>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-slate-400 text-xs">Author:</span>
                        <span className="text-slate-300 text-xs font-medium">{version.author}</span>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="text-slate-400 text-xs">Files:</span>
                        <div className="flex flex-wrap gap-1">
                          {version.files.map((file, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-blue-400 text-xs font-mono"
                            >
                              {file}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRollback(version.tag)}
                      disabled={rollbackingTag !== null}
                      className="px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {rollbackingTag === version.tag ? 'Rolling back...' : 'Rollback'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-white text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
