import React, { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { BranchHealthStatus, BranchStats } from '../lib/api';

interface BranchHealthPanelProps {
  refreshInterval?: number;  // in milliseconds
  showStats?: boolean;
  compact?: boolean;
}

/**
 * BranchHealthPanel - Displays real-time health status of all 3 detection branches
 *
 * @param refreshInterval - Auto-refresh interval in milliseconds (default: 30000)
 * @param showStats - Whether to show average scores (default: true)
 * @param compact - Compact mode for sidebar/header usage (default: false)
 */
export default function BranchHealthPanel({
  refreshInterval = 30000,
  showStats = true,
  compact = false
}: BranchHealthPanelProps) {
  const [health, setHealth] = useState<BranchHealthStatus | null>(null);
  const [stats, setStats] = useState<BranchStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [healthData, statsData] = await Promise.all([
        api.getBranchHealth(),
        showStats ? api.getBranchStats('24h') : Promise.resolve(null)
      ]);
      setHealth(healthData);
      setStats(statsData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch branch health');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, showStats]);

  if (isLoading) {
    return (
      <div className={`${compact ? 'p-2' : 'p-4'} flex items-center justify-center`}>
        <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${compact ? 'p-2' : 'p-4'} rounded-lg ${
        compact ? '' : 'bg-red-500/10 border border-red-500/30'
      }`}>
        <div className="flex items-start gap-2">
          <span className="text-red-400 text-lg">⚠</span>
          <div>
            <p className="text-red-400 text-sm font-medium">
              Branch health check failed
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {error}
            </p>
            <button
              onClick={fetchData}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!health) return null;

  // Compact mode - single row with status indicators
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {/* Branch A */}
        <div className="flex items-center gap-1.5" title="Heuristics Service">
          <div className={`w-2 h-2 rounded-full ${
            health.heuristics.status === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
          }`}></div>
          <span className="text-xs font-medium text-amber-400">A</span>
        </div>

        {/* Branch B */}
        <div className="flex items-center gap-1.5" title="Semantic Service">
          <div className={`w-2 h-2 rounded-full ${
            health.semantic.status === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
          }`}></div>
          <span className="text-xs font-medium text-purple-400">B</span>
        </div>

        {/* Branch C */}
        <div className="flex items-center gap-1.5" title="NLP Analysis">
          <div className={`w-2 h-2 rounded-full ${
            health.llm_guard.status === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
          }`}></div>
          <span className="text-xs font-medium text-cyan-400">C</span>
        </div>
      </div>
    );
  }

  // Full mode - cards with details
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
          3-Branch Health Status
        </h3>
        <button
          onClick={fetchData}
          className="text-xs text-text-secondary hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Branch A - Heuristics */}
        <div className={`rounded-xl border p-4 transition-colors ${
          health.heuristics.status === 'healthy'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
              <span className="font-semibold text-amber-400">Branch A</span>
            </div>
            <span className={`text-xs px-2 py-1 rounded font-medium ${
              health.heuristics.status === 'healthy'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {health.heuristics.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <h4 className="text-white font-medium mb-1">Heuristics Service</h4>
          <p className="text-xs text-text-secondary mb-3">
            Pattern matching, entropy analysis, obfuscation detection
          </p>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Latency:</span>
              <span className={`font-mono ${
                health.heuristics.latency_ms < 100 ? 'text-emerald-400' :
                health.heuristics.latency_ms < 500 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {health.heuristics.latency_ms}ms
              </span>
            </div>
            {stats && (
              <div className="flex justify-between">
                <span className="text-text-secondary">Avg Score (24h):</span>
                <span className="font-mono text-amber-400">
                  {stats.branch_a_avg.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Score Bar */}
          {stats && (
            <div className="mt-3">
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${stats.branch_a_avg}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Branch B - Semantic */}
        <div className={`rounded-xl border p-4 transition-colors ${
          health.semantic.status === 'healthy'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span className="font-semibold text-purple-400">Branch B</span>
            </div>
            <span className={`text-xs px-2 py-1 rounded font-medium ${
              health.semantic.status === 'healthy'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {health.semantic.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <h4 className="text-white font-medium mb-1">Semantic Service</h4>
          <p className="text-xs text-text-secondary mb-3">
            Embedding similarity via ClickHouse HNSW index
          </p>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Latency:</span>
              <span className={`font-mono ${
                health.semantic.latency_ms < 100 ? 'text-emerald-400' :
                health.semantic.latency_ms < 500 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {health.semantic.latency_ms}ms
              </span>
            </div>
            {stats && (
              <div className="flex justify-between">
                <span className="text-text-secondary">Avg Score (24h):</span>
                <span className="font-mono text-purple-400">
                  {stats.branch_b_avg.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Score Bar */}
          {stats && (
            <div className="mt-3">
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${stats.branch_b_avg}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Branch C - NLP Analysis */}
        <div className={`rounded-xl border p-4 transition-colors ${
          health.llm_guard.status === 'healthy'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
              <span className="font-semibold text-cyan-400">Branch C</span>
            </div>
            <span className={`text-xs px-2 py-1 rounded font-medium ${
              health.llm_guard.status === 'healthy'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {health.llm_guard.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <h4 className="text-white font-medium mb-1">NLP Safety Analysis</h4>
          <p className="text-xs text-text-secondary mb-3">
            NLP safety classifier (Llama Guard-based)
          </p>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Latency:</span>
              <span className={`font-mono ${
                health.llm_guard.latency_ms < 200 ? 'text-emerald-400' :
                health.llm_guard.latency_ms < 1000 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {health.llm_guard.latency_ms}ms
              </span>
            </div>
            {stats && (
              <div className="flex justify-between">
                <span className="text-text-secondary">Avg Score (24h):</span>
                <span className="font-mono text-cyan-400">
                  {stats.branch_c_avg.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Score Bar */}
          {stats && (
            <div className="mt-3">
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-500"
                  style={{ width: `${stats.branch_c_avg}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Degraded Mode Warning */}
      {(health.heuristics.status !== 'healthy' ||
        health.semantic.status !== 'healthy' ||
        health.llm_guard.status !== 'healthy') && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-yellow-400 text-xl">!</div>
            <div>
              <h4 className="text-yellow-400 font-medium">Degraded Mode Active</h4>
              <p className="text-sm text-text-secondary mt-1">
                One or more branches are offline. The Arbiter will use degraded weights for decision making.
                {health.llm_guard.status !== 'healthy' && (
                  <span className="block mt-1">
                    <span className="text-cyan-400">NLP analysis</span> is offline - using Heuristics (50%) + Semantic (50%) only.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All Online Indicator */}
      {health.heuristics.status === 'healthy' &&
       health.semantic.status === 'healthy' &&
       health.llm_guard.status === 'healthy' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-medium">All branches operational</span>
            <span className="text-xs text-text-secondary">
              Full 3-branch weighted voting active
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
