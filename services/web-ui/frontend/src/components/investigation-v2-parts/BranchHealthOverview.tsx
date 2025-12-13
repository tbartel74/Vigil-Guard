/**
 * BranchHealthOverview - Displays health status of 3 detection branches
 * Part of InvestigationV2 component refactoring (Sprint 3.1)
 */

import React from 'react';
import { BranchHealthStatus, BranchStats } from '../../lib/api';

interface BranchHealthOverviewProps {
  branchHealth: BranchHealthStatus | null;
  branchStats: BranchStats | null;
}

export default function BranchHealthOverview({ branchHealth, branchStats }: BranchHealthOverviewProps) {
  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-emerald-400';
      case 'degraded':
        return 'text-yellow-400';
      case 'unhealthy':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getHealthBg = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-500/20 border-emerald-500/50';
      case 'degraded':
        return 'bg-yellow-500/20 border-yellow-500/50';
      case 'unhealthy':
        return 'bg-red-500/20 border-red-500/50';
      default:
        return 'bg-slate-500/20 border-slate-500/50';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700 p-6 bg-surface-dark mb-6">
      <h2 className="text-lg font-semibold text-white mb-4">3-Branch Detection Pipeline</h2>
      <div className="grid grid-cols-3 gap-4">
        {/* Branch A - Heuristics */}
        <div className={`rounded-lg border p-4 ${getHealthBg(branchHealth?.heuristics?.status || 'unknown')}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-amber-400 font-medium">Branch A</span>
            <span className={`text-xs px-2 py-1 rounded ${getHealthColor(branchHealth?.heuristics?.status || 'unknown')}`}>
              {branchHealth?.heuristics?.status || 'unknown'}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-1">Heuristics Engine</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono text-white">
              {branchStats?.branch_a_avg?.toFixed(1) || '0.0'}
            </span>
            <span className="text-xs text-text-secondary">avg score (24h)</span>
          </div>
          {branchHealth?.heuristics?.latency_ms !== undefined && (
            <p className="text-xs text-text-secondary mt-1">
              Latency: {branchHealth.heuristics.latency_ms}ms
            </p>
          )}
        </div>

        {/* Branch B - Semantic */}
        <div className={`rounded-lg border p-4 ${getHealthBg(branchHealth?.semantic?.status || 'unknown')}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-400 font-medium">Branch B</span>
            <span className={`text-xs px-2 py-1 rounded ${getHealthColor(branchHealth?.semantic?.status || 'unknown')}`}>
              {branchHealth?.semantic?.status || 'unknown'}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-1">Semantic Analysis</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono text-white">
              {branchStats?.branch_b_avg?.toFixed(1) || '0.0'}
            </span>
            <span className="text-xs text-text-secondary">avg score (24h)</span>
          </div>
          {branchHealth?.semantic?.latency_ms !== undefined && (
            <p className="text-xs text-text-secondary mt-1">
              Latency: {branchHealth.semantic.latency_ms}ms
            </p>
          )}
        </div>

        {/* Branch C - LLM Guard */}
        <div className={`rounded-lg border p-4 ${getHealthBg(branchHealth?.llm_guard?.status || 'unknown')}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-cyan-400 font-medium">Branch C</span>
            <span className={`text-xs px-2 py-1 rounded ${getHealthColor(branchHealth?.llm_guard?.status || 'unknown')}`}>
              {branchHealth?.llm_guard?.status || 'unknown'}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-1">LLM Safety Engine</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono text-white">
              {branchStats?.branch_c_avg?.toFixed(1) || '0.0'}
            </span>
            <span className="text-xs text-text-secondary">avg score (24h)</span>
          </div>
          {branchHealth?.llm_guard?.latency_ms !== undefined && (
            <p className="text-xs text-text-secondary mt-1">
              Latency: {branchHealth.llm_guard.latency_ms}ms
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
