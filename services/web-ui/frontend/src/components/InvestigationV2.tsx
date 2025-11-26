import React, { useState, useEffect } from 'react';
import * as api from '../lib/api';
import { SearchParamsV2, EventV2Row, QuickStatsV2, BranchStats, BranchHealthStatus } from '../lib/api';

/**
 * InvestigationV2 - Investigation panel for Vigil Guard v2.0.0
 * Displays events from events_v2 table with 3-branch detection architecture
 */
export default function InvestigationV2() {
  const [searchParams, setSearchParams] = useState<SearchParamsV2>({
    startDate: undefined,
    endDate: undefined,
    textQuery: '',
    clientId: '',
    status: null,
    minScore: 0,
    maxScore: 100,
    boostFilter: '',
    sortBy: 'timestamp',
    sortOrder: 'DESC',
    page: 1,
    pageSize: 25,
  });

  const [results, setResults] = useState<EventV2Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventV2Row | null>(null);
  const [stats, setStats] = useState<QuickStatsV2 | null>(null);
  const [branchStats, setBranchStats] = useState<BranchStats | null>(null);
  const [branchHealth, setBranchHealth] = useState<BranchHealthStatus | null>(null);

  // Execute search - handle errors gracefully
  const handleSearch = async () => {
    setIsLoading(true);
    try {
      const response = await api.searchEventsV2(searchParams);
      setResults(response.results || []);
      setTotal(response.total || 0);
      setPages(response.pages || 0);
    } catch (error) {
      console.error('Search error:', error);
      // Set empty results on error (e.g., events_v2 table doesn't exist)
      setResults([]);
      setTotal(0);
      setPages(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch stats - handle partial failures gracefully
  const fetchStats = async () => {
    // Fetch health first (most likely to succeed)
    try {
      const health = await api.getBranchHealth();
      setBranchHealth(health);
    } catch (error) {
      console.error('Failed to fetch branch health:', error);
      setBranchHealth({
        heuristics: { status: 'unknown', latency_ms: 0 },
        semantic: { status: 'unknown', latency_ms: 0 },
        llm_guard: { status: 'unknown', latency_ms: 0 },
      });
    }

    // Fetch stats (may fail if events_v2 table doesn't exist yet)
    try {
      const quickStats = await api.getEventsV2Stats('24h');
      setStats(quickStats);
    } catch (error) {
      console.error('Failed to fetch events stats:', error);
      setStats({
        requests_processed: 0,
        threats_blocked: 0,
        content_sanitized: 0,
        pii_sanitized: 0,
      });
    }

    try {
      const bStats = await api.getBranchStats('24h');
      setBranchStats(bStats);
    } catch (error) {
      console.error('Failed to fetch branch stats:', error);
      setBranchStats({
        branch_a_avg: 0,
        branch_b_avg: 0,
        branch_c_avg: 0,
        threat_score_avg: 0,
        confidence_avg: 0,
      });
    }
  };

  // Auto-search on mount and when page/sort changes
  useEffect(() => {
    handleSearch();
  }, [searchParams.page, searchParams.sortBy, searchParams.sortOrder]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Clear filters
  const handleClearFilters = () => {
    setSearchParams({
      ...searchParams,
      startDate: undefined,
      endDate: undefined,
      textQuery: '',
      clientId: '',
      status: null,
      minScore: 0,
      maxScore: 100,
      boostFilter: '',
      page: 1,
    });
  };

  // Score badge color helper
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-red-400';
    if (score >= 50) return 'text-orange-400';
    if (score >= 30) return 'text-yellow-400';
    return 'text-emerald-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return 'bg-red-500/20';
    if (score >= 50) return 'bg-orange-500/20';
    if (score >= 30) return 'bg-yellow-500/20';
    return 'bg-emerald-500/20';
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          Investigation
          <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded">v2.0.0</span>
        </h1>
        <p className="text-text-secondary mt-2">
          3-Branch Detection Architecture analysis with Arbiter decision engine
        </p>
      </div>

      {/* Branch Health Overview */}
      {branchHealth && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                <span className="font-medium text-amber-400">Branch A</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                branchHealth.heuristics?.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {branchHealth.heuristics?.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="text-sm text-text-secondary">Heuristics Service</div>
            {branchStats && (
              <div className="mt-2 text-lg font-mono text-amber-400">
                Avg: {(branchStats.branch_a_avg ?? 0).toFixed(1)}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="font-medium text-purple-400">Branch B</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                branchHealth.semantic?.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {branchHealth.semantic?.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="text-sm text-text-secondary">Semantic Service</div>
            {branchStats && (
              <div className="mt-2 text-lg font-mono text-purple-400">
                Avg: {(branchStats.branch_b_avg ?? 0).toFixed(1)}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
                <span className="font-medium text-cyan-400">Branch C</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                branchHealth.llm_guard?.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {branchHealth.llm_guard?.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="text-sm text-text-secondary">LLM Guard</div>
            {branchStats && (
              <div className="mt-2 text-lg font-mono text-cyan-400">
                Avg: {(branchStats.branch_c_avg ?? 0).toFixed(1)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
            <div className="text-text-secondary text-sm mb-1">Total Events (24h)</div>
            <div className="text-2xl font-mono text-white">{(stats.requests_processed ?? 0).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
            <div className="text-text-secondary text-sm mb-1">Blocked</div>
            <div className="text-2xl font-mono text-red-400">{(stats.threats_blocked ?? 0).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
            <div className="text-text-secondary text-sm mb-1">Allowed</div>
            <div className="text-2xl font-mono text-emerald-400">{((stats.requests_processed ?? 0) - (stats.threats_blocked ?? 0) - (stats.content_sanitized ?? 0)).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-700 p-4 bg-surface-dark">
            <div className="text-text-secondary text-sm mb-1">PII Redacted</div>
            <div className="text-2xl font-mono text-yellow-400">{(stats.content_sanitized ?? 0).toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Search Filters Card */}
      <div className="mb-6 rounded-2xl border border-slate-700 p-6 bg-surface-dark">
        <h2 className="text-lg font-semibold text-white mb-4">Search Filters</h2>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          {/* Date Range */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">Start Date</label>
            <input
              type="datetime-local"
              value={searchParams.startDate?.substring(0, 16) || ''}
              onChange={(e) => setSearchParams({ ...searchParams, startDate: e.target.value ? `${e.target.value}:00Z` : undefined })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-2">End Date</label>
            <input
              type="datetime-local"
              value={searchParams.endDate?.substring(0, 16) || ''}
              onChange={(e) => setSearchParams({ ...searchParams, endDate: e.target.value ? `${e.target.value}:00Z` : undefined })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">Status</label>
            <select
              value={searchParams.status || ''}
              onChange={(e) => setSearchParams({ ...searchParams, status: e.target.value ? e.target.value as any : null })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="ALLOWED">ALLOWED</option>
              <option value="SANITIZED">SANITIZED</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </div>

          {/* Boost Filter */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">Priority Boost Applied</label>
            <select
              value={searchParams.boostFilter || ''}
              onChange={(e) => setSearchParams({ ...searchParams, boostFilter: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Any/None</option>
              <option value="CONSERVATIVE_OVERRIDE">CONSERVATIVE_OVERRIDE</option>
              <option value="SEMANTIC_HIGH_SIMILARITY">SEMANTIC_HIGH_SIMILARITY</option>
              <option value="UNANIMOUS_LOW">UNANIMOUS_LOW</option>
              <option value="LLM_GUARD_VETO">LLM_GUARD_VETO</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Text Search */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">Search in Prompt Content</label>
            <input
              type="text"
              placeholder="Search for keywords..."
              value={searchParams.textQuery || ''}
              onChange={(e) => setSearchParams({ ...searchParams, textQuery: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Client ID Filter */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">Client ID</label>
            <input
              type="text"
              placeholder="e.g. vigil_1730470496_abc123xyz"
              value={searchParams.clientId || ''}
              onChange={(e) => setSearchParams({ ...searchParams, clientId: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={handleClearFilters}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Clear Filters
          </button>
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isLoading ? 'Searching...' : `Search (${total.toLocaleString()} results)`}
          </button>
        </div>
      </div>

      {/* Search Results Card */}
      <div className="rounded-2xl border border-slate-700 p-6 bg-surface-dark">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Search Results</h2>
            <p className="text-sm text-text-secondary">
              Showing {((searchParams.page - 1) * searchParams.pageSize) + 1}-
              {Math.min(searchParams.page * searchParams.pageSize, total)} of {total.toLocaleString()} results
            </p>
          </div>
        </div>

        {/* Results Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            No events found matching your criteria
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-700">
                  <tr>
                    <th className="text-left py-3 px-3 text-sm font-medium text-text-secondary">Timestamp</th>
                    <th className="text-left py-3 px-3 text-sm font-medium text-text-secondary">Input (preview)</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-amber-400">A</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-purple-400">B</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-cyan-400">C</th>
                    <th className="text-center py-3 px-3 text-sm font-medium text-text-secondary">Combined</th>
                    <th className="text-left py-3 px-3 text-sm font-medium text-text-secondary">Status</th>
                    <th className="text-left py-3 px-3 text-sm font-medium text-text-secondary">Boosts</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedEvent(row)}
                      className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 text-sm text-white">
                        {new Date(row.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-sm text-white max-w-xs truncate">
                        {row.original_input.substring(0, 80)}
                        {row.original_input.length > 80 && '...'}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`text-sm font-mono ${getScoreColor(row.branch_a_score)}`}>
                          {row.branch_a_score}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`text-sm font-mono ${getScoreColor(row.branch_b_score)}`}>
                          {row.branch_b_score}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`text-sm font-mono ${getScoreColor(row.branch_c_score)}`}>
                          {row.branch_c_score}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-1 rounded text-sm font-mono ${getScoreBg(row.threat_score)} ${getScoreColor(row.threat_score)}`}>
                          {row.threat_score}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          row.final_status === 'ALLOWED' ? 'bg-emerald-500/20 text-emerald-400' :
                          row.final_status === 'SANITIZED' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {row.final_status === 'SANITIZED' ? 'PII Redacted' : row.final_status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-text-secondary">
                        {row.boosts_applied.length > 0
                          ? row.boosts_applied.map(b => b.replace(/_/g, ' ')).join(', ')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 flex justify-between items-center">
              <div className="text-sm text-text-secondary">
                Page {searchParams.page} of {pages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSearchParams({ ...searchParams, page: searchParams.page - 1 })}
                  disabled={searchParams.page === 1}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setSearchParams({ ...searchParams, page: searchParams.page + 1 })}
                  disabled={searchParams.page >= pages}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-600 max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Event Details</h2>
                  <p className="text-sm text-slate-400 mt-1">Event ID: {selectedEvent.id}</p>
                  <p className="text-sm text-slate-400">
                    {new Date(selectedEvent.timestamp).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Original Input */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-slate-300 mb-2">Original Input</h3>
                  <p className="text-white text-sm whitespace-pre-wrap break-words font-mono">
                    {selectedEvent.original_input}
                  </p>
                </div>

                {/* Result Output */}
                {selectedEvent.result && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-slate-300 mb-2">Output Returned</h3>
                    <p className="text-white text-sm whitespace-pre-wrap break-words font-mono">
                      {selectedEvent.result}
                    </p>
                  </div>
                )}

                {/* 3-Branch Scores */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-800 border border-amber-500/50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-amber-400 mb-2">Branch A (Heuristics)</h3>
                    <p className={`text-3xl font-mono ${getScoreColor(selectedEvent.branch_a_score)}`}>
                      {selectedEvent.branch_a_score}
                    </p>
                  </div>

                  <div className="bg-slate-800 border border-purple-500/50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-purple-400 mb-2">Branch B (Semantic)</h3>
                    <p className={`text-3xl font-mono ${getScoreColor(selectedEvent.branch_b_score)}`}>
                      {selectedEvent.branch_b_score}
                    </p>
                  </div>

                  <div className="bg-slate-800 border border-cyan-500/50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-cyan-400 mb-2">Branch C (LLM Guard)</h3>
                    <p className={`text-3xl font-mono ${getScoreColor(selectedEvent.branch_c_score)}`}>
                      {selectedEvent.branch_c_score}
                    </p>
                  </div>

                  <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-slate-300 mb-2">Combined Score</h3>
                    <p className={`text-3xl font-mono ${getScoreColor(selectedEvent.threat_score)}`}>
                      {selectedEvent.threat_score}
                    </p>
                    <p className="text-xs text-text-secondary mt-1">
                      Confidence: {(selectedEvent.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* Decision & Boosts */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-slate-300 mb-2">Final Decision</h3>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded text-sm font-medium ${
                        selectedEvent.final_status === 'ALLOWED' ? 'bg-emerald-500/20 text-emerald-400' :
                        selectedEvent.final_status === 'SANITIZED' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {selectedEvent.final_status === 'SANITIZED' ? 'PII Redacted' : selectedEvent.final_status}
                      </span>
                      <span className="text-sm text-text-secondary">
                        ({selectedEvent.final_decision})
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-slate-300 mb-2">Priority Boosts Applied</h3>
                    {selectedEvent.boosts_applied.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedEvent.boosts_applied.map((boost, idx) => (
                          <span key={idx} className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs">
                            {boost}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-text-secondary text-sm">None</p>
                    )}
                  </div>
                </div>

                {/* PII Information */}
                {selectedEvent.pii_sanitized && (
                  <div className="bg-slate-800 border border-blue-500/50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-blue-400 mb-2">PII Detection</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-text-secondary text-sm">Entities Found: </span>
                          <span className="text-white font-mono">{selectedEvent.pii_entities_count}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {selectedEvent.pii_types_detected.map((type, idx) => (
                            <span key={idx} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                      {selectedEvent.pii_classification_json && (
                        <div>
                          <span className="text-text-secondary text-sm">Detection Method: </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            selectedEvent.pii_classification_json.method === 'presidio' ? 'bg-emerald-500/20 text-emerald-400' :
                            selectedEvent.pii_classification_json.method === 'presidio_dual_language' ? 'bg-emerald-500/20 text-emerald-400' :
                            selectedEvent.pii_classification_json.method === 'regex_fallback' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {selectedEvent.pii_classification_json.method || 'unknown'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-slate-300 mb-2">Metadata</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-text-secondary">Client ID: </span>
                      <span className="text-white font-mono">{selectedEvent.client_id || '-'}</span>
                    </div>
                    <div>
                      <span className="text-text-secondary">Detected Language: </span>
                      <span className="text-white font-mono">{selectedEvent.detected_language || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
