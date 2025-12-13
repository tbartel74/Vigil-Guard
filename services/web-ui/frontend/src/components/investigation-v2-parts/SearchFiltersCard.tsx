/**
 * SearchFiltersCard - Search filters form for Investigation V2
 * Part of InvestigationV2 component refactoring (Sprint 3.1)
 */

import React from 'react';
import { SearchParamsV2 } from '../../lib/api';

interface SearchFiltersCardProps {
  searchParams: SearchParamsV2;
  setSearchParams: React.Dispatch<React.SetStateAction<SearchParamsV2>>;
  onSearch: () => void;
  isLoading: boolean;
}

export default function SearchFiltersCard({
  searchParams,
  setSearchParams,
  onSearch,
  isLoading
}: SearchFiltersCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700 p-6 bg-surface-dark mb-6">
      <h2 className="text-lg font-semibold text-white mb-4">Search Filters</h2>
      <div className="grid grid-cols-4 gap-4">
        {/* Date Range */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">Start Date</label>
          <input
            type="datetime-local"
            value={searchParams.startDate || ''}
            onChange={(e) => setSearchParams({ ...searchParams, startDate: e.target.value || undefined })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">End Date</label>
          <input
            type="datetime-local"
            value={searchParams.endDate || ''}
            onChange={(e) => setSearchParams({ ...searchParams, endDate: e.target.value || undefined })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Text Search */}
        <div className="col-span-2">
          <label className="block text-sm text-text-secondary mb-1">Text Search</label>
          <input
            type="text"
            placeholder="Search in original input..."
            value={searchParams.textQuery}
            onChange={(e) => setSearchParams({ ...searchParams, textQuery: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Client ID */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">Client ID</label>
          <input
            type="text"
            placeholder="Filter by client..."
            value={searchParams.clientId}
            onChange={(e) => setSearchParams({ ...searchParams, clientId: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">Status</label>
          <select
            value={searchParams.status || ''}
            onChange={(e) => setSearchParams({ ...searchParams, status: (e.target.value as 'ALLOWED' | 'SANITIZED' | 'BLOCKED') || null })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="ALLOWED">Allowed</option>
            <option value="SANITIZED">Sanitized</option>
            <option value="BLOCKED">Blocked</option>
          </select>
        </div>

        {/* Score Range */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">Min Score</label>
          <input
            type="number"
            min="0"
            max="100"
            value={searchParams.minScore}
            onChange={(e) => setSearchParams({ ...searchParams, minScore: parseInt(e.target.value) || 0 })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Max Score</label>
          <input
            type="number"
            min="0"
            max="100"
            value={searchParams.maxScore}
            onChange={(e) => setSearchParams({ ...searchParams, maxScore: parseInt(e.target.value) || 100 })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Boost Filter */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">Boost Applied</label>
          <input
            type="text"
            placeholder="e.g., SEMANTIC_BOOST"
            value={searchParams.boostFilter}
            onChange={(e) => setSearchParams({ ...searchParams, boostFilter: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Sort Options */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">Sort By</label>
          <select
            value={searchParams.sortBy}
            onChange={(e) => setSearchParams({ ...searchParams, sortBy: e.target.value as any })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="timestamp">Timestamp</option>
            <option value="threat_score">Threat Score</option>
            <option value="branch_a_score">Branch A Score</option>
            <option value="branch_b_score">Branch B Score</option>
            <option value="branch_c_score">Branch C Score</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">Order</label>
          <select
            value={searchParams.sortOrder}
            onChange={(e) => setSearchParams({ ...searchParams, sortOrder: e.target.value as 'ASC' | 'DESC' })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="DESC">Newest First</option>
            <option value="ASC">Oldest First</option>
          </select>
        </div>

        {/* Search Button */}
        <div className="col-span-2 flex items-end">
          <button
            onClick={onSearch}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded font-medium transition-colors"
          >
            {isLoading ? 'Searching...' : 'Search Events'}
          </button>
        </div>
      </div>
    </div>
  );
}
