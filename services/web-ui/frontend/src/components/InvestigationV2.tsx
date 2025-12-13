/**
 * InvestigationV2 - Investigation panel for Vigil Guard v2.0.0
 * Displays events from events_v2 table with 3-branch detection architecture
 *
 * Sprint 3.1 Refactoring: Split from 651 lines to modular components
 * - BranchHealthOverview: 3-branch pipeline status
 * - QuickStatsPanel: 24h statistics cards
 * - SearchFiltersCard: Search filters form
 * - ResultsTable: Results table with pagination
 * - EventDetailsModal: Event details modal
 */

import React, { useState, useEffect } from 'react';
import * as api from '../lib/api';
import { SearchParamsV2, EventV2Row, QuickStatsV2, BranchStats, BranchHealthStatus } from '../lib/api';
import {
  BranchHealthOverview,
  QuickStatsPanel,
  SearchFiltersCard,
  ResultsTable,
  EventDetailsModal
} from './investigation-v2-parts';

export default function InvestigationV2() {
  // Search state
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

  // Results state
  const [results, setResults] = useState<EventV2Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventV2Row | null>(null);

  // Stats state
  const [stats, setStats] = useState<QuickStatsV2 | null>(null);
  const [branchStats, setBranchStats] = useState<BranchStats | null>(null);
  const [branchHealth, setBranchHealth] = useState<BranchHealthStatus | null>(null);

  // Execute search - handle errors gracefully
  const handleSearch = async () => {
    setIsLoading(true);
    setSearchError(null);
    try {
      const response = await api.searchEventsV2(searchParams);
      setResults(response.results || []);
      setTotal(response.total || 0);
      setPages(response.pages || 0);
    } catch (error: any) {
      console.error('Search error:', error);
      setResults([]);
      setTotal(0);
      setPages(0);
      const message = error?.message || 'Search failed';
      if (message.includes('events_v2') || message.includes('UNKNOWN_TABLE')) {
        setSearchError('Events V2 table not found. Please run ClickHouse migration.');
      } else if (message.includes('ECONNREFUSED')) {
        setSearchError('Cannot connect to ClickHouse. Please check service status.');
      } else {
        setSearchError(message);
      }
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

  // Initial data fetch
  useEffect(() => {
    fetchStats();
    handleSearch();
  }, []);

  // Refetch on page change
  useEffect(() => {
    handleSearch();
  }, [searchParams.page]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Investigation Panel</h1>
          <p className="text-text-secondary mt-1">
            Analyze detection events from 3-branch architecture (v2.0.0)
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchStats}
            className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
          >
            Refresh Stats
          </button>
        </div>
      </div>

      {/* Branch Health Overview */}
      <BranchHealthOverview
        branchHealth={branchHealth}
        branchStats={branchStats}
      />

      {/* Quick Stats */}
      <QuickStatsPanel stats={stats} />

      {/* Search Filters */}
      <SearchFiltersCard
        searchParams={searchParams}
        setSearchParams={setSearchParams}
        onSearch={handleSearch}
        isLoading={isLoading}
      />

      {/* Results Table */}
      <ResultsTable
        results={results}
        total={total}
        pages={pages}
        searchParams={searchParams}
        setSearchParams={setSearchParams}
        isLoading={isLoading}
        searchError={searchError}
        onRetry={handleSearch}
        onSelectEvent={setSelectedEvent}
      />

      {/* Event Details Modal */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
