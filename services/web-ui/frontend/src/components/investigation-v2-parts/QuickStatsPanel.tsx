/**
 * QuickStatsPanel - Displays quick statistics cards (24h)
 * Part of InvestigationV2 component refactoring (Sprint 3.1)
 */

import React from 'react';
import { QuickStatsV2 } from '../../lib/api';

interface QuickStatsPanelProps {
  stats: QuickStatsV2 | null;
}

export default function QuickStatsPanel({ stats }: QuickStatsPanelProps) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
        <p className="text-sm text-text-secondary mb-1">Requests (24h)</p>
        <p className="text-2xl font-mono text-white">{stats?.requests_processed?.toLocaleString() || 0}</p>
      </div>
      <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
        <p className="text-sm text-text-secondary mb-1">Threats Blocked</p>
        <p className="text-2xl font-mono text-red-400">{stats?.threats_blocked?.toLocaleString() || 0}</p>
      </div>
      <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
        <p className="text-sm text-text-secondary mb-1">Content Sanitized</p>
        <p className="text-2xl font-mono text-yellow-400">{stats?.content_sanitized?.toLocaleString() || 0}</p>
      </div>
      <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
        <p className="text-sm text-text-secondary mb-1">PII Redacted</p>
        <p className="text-2xl font-mono text-blue-400">{stats?.pii_sanitized?.toLocaleString() || 0}</p>
      </div>
    </div>
  );
}
