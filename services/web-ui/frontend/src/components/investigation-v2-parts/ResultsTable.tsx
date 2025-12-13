/**
 * ResultsTable - Search results table with pagination
 * Part of InvestigationV2 component refactoring (Sprint 3.1)
 */

import React from 'react';
import { EventV2Row, SearchParamsV2 } from '../../lib/api';
import { getScoreColor, getScoreBg, getStatusClasses, formatStatus } from './utils';

interface ResultsTableProps {
  results: EventV2Row[];
  total: number;
  pages: number;
  searchParams: SearchParamsV2;
  setSearchParams: React.Dispatch<React.SetStateAction<SearchParamsV2>>;
  isLoading: boolean;
  searchError: string | null;
  onRetry: () => void;
  onSelectEvent: (event: EventV2Row) => void;
}

export default function ResultsTable({
  results,
  total,
  pages,
  searchParams,
  setSearchParams,
  isLoading,
  searchError,
  onRetry,
  onSelectEvent
}: ResultsTableProps) {
  return (
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
      ) : searchError ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 my-4">
          <div className="flex items-start gap-3">
            <span className="text-red-400 text-xl">⚠</span>
            <div>
              <h4 className="text-red-400 font-medium">Search Failed</h4>
              <p className="text-sm text-text-secondary mt-1">{searchError}</p>
              <button
                onClick={onRetry}
                className="mt-3 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm rounded transition-colors"
              >
                Retry Search
              </button>
            </div>
          </div>
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
                    onClick={() => onSelectEvent(row)}
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
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusClasses(row.final_status)}`}>
                        {formatStatus(row.final_status)}
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
  );
}
