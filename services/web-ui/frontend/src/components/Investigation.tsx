import React, { useState, useEffect } from 'react';
import * as api from '../lib/api';
import { SearchParams, SearchResultRow } from '../lib/api';

export default function Investigation() {
  const [searchParams, setSearchParams] = useState<SearchParams>({
    startDate: undefined,
    endDate: undefined,
    textQuery: '',
    status: null,
    minScore: 0,
    maxScore: 100,
    categories: [],
    sortBy: 'timestamp',
    sortOrder: 'DESC',
    page: 1,
    pageSize: 25,
  });

  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<SearchResultRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Execute search
  const handleSearch = async () => {
    setIsLoading(true);
    try {
      const response = await api.searchPrompts(searchParams);
      setResults(response.results);
      setTotal(response.total);
      setPages(response.pages);
    } catch (error) {
      console.error('Search error:', error);
      // TODO: Show toast notification
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-search on mount and when page/sort changes
  useEffect(() => {
    handleSearch();
  }, [searchParams.page, searchParams.sortBy, searchParams.sortOrder]);

  // Handle export
  const handleExport = async (format: 'csv' | 'json') => {
    setIsExporting(true);
    try {
      const blob = await api.exportPrompts(
        {
          startDate: searchParams.startDate,
          endDate: searchParams.endDate,
          textQuery: searchParams.textQuery,
          status: searchParams.status,
          minScore: searchParams.minScore,
          maxScore: searchParams.maxScore,
          categories: searchParams.categories,
          sortBy: searchParams.sortBy,
          sortOrder: searchParams.sortOrder,
        },
        format
      );

      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `prompts-export-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      // TODO: Show toast notification
    } finally {
      setIsExporting(false);
    }
  };

  // Clear filters
  const handleClearFilters = () => {
    setSearchParams({
      ...searchParams,
      startDate: undefined,
      endDate: undefined,
      textQuery: '',
      status: null,
      minScore: 0,
      maxScore: 100,
      categories: [],
      page: 1,
    });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Investigation</h1>
        <p className="text-text-secondary mt-2">
          Deep-dive analysis and historical prompt search with advanced filtering
        </p>
      </div>

      {/* Search Filters Card */}
      <div className="mb-6 rounded-2xl border border-slate-700 p-6 bg-surface-dark">
        <h2 className="text-lg font-semibold text-white mb-4">Search Filters</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
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

          {/* Threat Score Range */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">
              Threat Score Range: {searchParams.minScore} - {searchParams.maxScore}
            </label>
            <div className="flex gap-4 items-center">
              <input
                type="number"
                min="0"
                max="100"
                value={searchParams.minScore}
                onChange={(e) => setSearchParams({ ...searchParams, minScore: Number(e.target.value) })}
                className="w-20 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={searchParams.maxScore}
                  onChange={(e) => setSearchParams({ ...searchParams, maxScore: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={searchParams.maxScore}
                onChange={(e) => setSearchParams({ ...searchParams, maxScore: Number(e.target.value) })}
                className="w-20 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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

          {/* Export Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('csv')}
              disabled={isExporting || total === 0}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              disabled={isExporting || total === 0}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Results Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            No prompts found matching your criteria
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-700">
                  <tr>
                    <th className="text-left py-3 px-3 text-sm font-medium text-text-secondary">Timestamp</th>
                    <th className="text-left py-3 px-3 text-sm font-medium text-text-secondary">Prompt (preview)</th>
                    <th className="text-left py-3 px-3 text-sm font-medium text-text-secondary">Status</th>
                    <th className="text-left py-3 px-3 text-sm font-medium text-text-secondary">Score</th>
                    <th className="text-left py-3 px-3 text-sm font-medium text-text-secondary">Categories</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr
                      key={row.event_id}
                      onClick={() => setSelectedPrompt(row)}
                      className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 text-sm text-white">
                        {new Date(row.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-sm text-white max-w-md truncate">
                        {row.prompt_input.substring(0, 100)}
                        {row.prompt_input.length > 100 && '...'}
                      </td>
                      <td className="py-3 px-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          row.final_status === 'ALLOWED' ? 'bg-emerald-500/20 text-emerald-400' :
                          row.final_status === 'SANITIZED' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {row.final_status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-sm text-white font-mono">
                        {row.threat_score}
                      </td>
                      <td className="py-3 px-3 text-sm text-text-secondary">
                        {row.detected_categories.length > 0
                          ? row.detected_categories.slice(0, 2).join(', ') +
                            (row.detected_categories.length > 2 ? ` +${row.detected_categories.length - 2}` : '')
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

      {/* Prompt Details Modal */}
      {selectedPrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-600 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Prompt Details</h2>
                  <p className="text-sm text-slate-400 mt-1">Event ID: {selectedPrompt.event_id}</p>
                  <p className="text-sm text-slate-400">
                    {new Date(selectedPrompt.timestamp).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPrompt(null)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {(() => {
                  // Parse JSON data
                  const pipeline = selectedPrompt.pipeline_flow ? JSON.parse(selectedPrompt.pipeline_flow) : {};
                  const scoring = selectedPrompt.scoring ? JSON.parse(selectedPrompt.scoring) : {};
                  const promptGuard = selectedPrompt.prompt_guard ? JSON.parse(selectedPrompt.prompt_guard) : {};
                  const decision = selectedPrompt.final_decision ? JSON.parse(selectedPrompt.final_decision) : {};
                  const sanitizer = selectedPrompt.sanitizer ? JSON.parse(selectedPrompt.sanitizer) : {};

                  return (
                    <>
                      {/* Original Input */}
                      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-slate-300 mb-2">Original Input</h3>
                        <p className="text-white text-sm whitespace-pre-wrap break-words font-mono">
                          {pipeline.input_raw || selectedPrompt.prompt_input}
                        </p>
                      </div>

                      {/* Output Returned to User */}
                      {pipeline.output_final && (
                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <h3 className="text-sm font-medium text-slate-300 mb-2">Output Returned to User</h3>
                          <p className="text-white text-sm whitespace-pre-wrap break-words font-mono">
                            {pipeline.output_final}
                          </p>
                        </div>
                      )}

                      {/* Status & Scores */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <h3 className="text-sm font-medium text-slate-300 mb-2">Final Status</h3>
                          <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${
                            selectedPrompt.final_status === 'ALLOWED' ? 'bg-emerald-500/20 text-emerald-400' :
                            selectedPrompt.final_status === 'SANITIZED' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {selectedPrompt.final_status}
                          </span>
                        </div>

                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <h3 className="text-sm font-medium text-slate-300 mb-2">Sanitizer Score</h3>
                          <p className="text-white text-lg font-mono">{scoring.sanitizer_score || selectedPrompt.threat_score || 0}</p>
                        </div>

                        {promptGuard.score !== undefined && (
                          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                            <h3 className="text-sm font-medium text-slate-300 mb-2">Prompt Guard Score</h3>
                            <p className="text-white text-lg font-mono">{promptGuard.score || 0}</p>
                            <p className="text-xs text-slate-400 mt-1">{promptGuard.risk_level || 'N/A'}</p>
                          </div>
                        )}
                      </div>

                      {/* Decision Details */}
                      {decision.internal_note && (
                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <h3 className="text-sm font-medium text-slate-300 mb-2">Decision Reason</h3>
                          <p className="text-slate-300 text-sm">{decision.internal_note}</p>
                          <p className="text-xs text-slate-400 mt-2">
                            Action: <span className="text-white font-mono">{decision.action_taken || 'N/A'}</span>
                            {' • '}
                            Source: <span className="text-white font-mono">{decision.source || 'N/A'}</span>
                          </p>
                        </div>
                      )}

                      {/* Score Breakdown */}
                      {scoring.score_breakdown && Object.keys(scoring.score_breakdown).length > 0 && (
                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <h3 className="text-sm font-medium text-slate-300 mb-3">Score Breakdown by Category</h3>
                          <div className="space-y-2">
                            {Object.entries(scoring.score_breakdown).map(([category, score]: [string, any]) => (
                              <div key={category} className="flex justify-between items-center">
                                <span className="text-slate-300 text-sm font-mono">{category}</span>
                                <span className="text-white text-sm font-bold">{score}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pattern Matches */}
                      {scoring.match_details && scoring.match_details.length > 0 && (
                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <h3 className="text-sm font-medium text-slate-300 mb-3">Detected Patterns</h3>
                          <div className="space-y-3">
                            {scoring.match_details.map((detail: any, idx: number) => (
                              <div key={idx} className="border-l-2 border-red-500 pl-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-red-400 text-sm font-medium">{detail.category}</span>
                                  <span className="text-xs text-slate-400">({detail.matchCount} matches, score: {detail.score})</span>
                                </div>
                                {detail.matches && detail.matches.length > 0 && (
                                  <div className="space-y-1">
                                    {detail.matches.slice(0, 3).map((match: any, midx: number) => (
                                      <div key={midx} className="text-xs text-slate-400">
                                        Pattern: <span className="font-mono text-slate-300">{match.pattern?.substring(0, 60)}...</span>
                                        {match.samples && match.samples.length > 0 && (
                                          <div className="ml-4 mt-0.5">
                                            Matched: <span className="font-mono text-white">"{match.samples[0]}"</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Processing Pipeline */}
                      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-slate-300 mb-3">Processing Pipeline</h3>
                        <div className="space-y-2 text-xs">
                          {pipeline.input_normalized && (
                            <div>
                              <span className="text-slate-400">Normalized:</span>
                              <span className="ml-2 text-slate-300 font-mono">{pipeline.input_normalized}</span>
                            </div>
                          )}
                          {pipeline.after_pii_redaction && (
                            <div>
                              <span className="text-slate-400">After PII Redaction:</span>
                              <span className="ml-2 text-slate-300 font-mono">{pipeline.after_pii_redaction}</span>
                            </div>
                          )}
                          {pipeline.after_sanitization && (
                            <div>
                              <span className="text-slate-400">After Sanitization:</span>
                              <span className="ml-2 text-slate-300 font-mono">{pipeline.after_sanitization}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
