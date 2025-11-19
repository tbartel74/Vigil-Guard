import { useState, useEffect } from 'react';
import * as api from '../lib/api';

type TabType = 'overview' | 'reports' | 'analytics';

export default function FPReporting() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [timeRange, setTimeRange] = useState<string>('30 DAY');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overview tab state
  const [basicStats, setBasicStats] = useState<any>(null);
  const [reasonStats, setReasonStats] = useState<api.FPReasonStats[]>([]);
  const [trendData, setTrendData] = useState<api.FPTrendData[]>([]);

  // Reports tab state
  const [reports, setReports] = useState<api.FPReportDetailed[]>([]);
  const [totalReports, setTotalReports] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // Search filters
  const [filterReason, setFilterReason] = useState<string>('');
  const [filterReporter, setFilterReporter] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterMinScore, setFilterMinScore] = useState<number | undefined>();
  const [filterMaxScore, setFilterMaxScore] = useState<number | undefined>();

  // Analytics tab state
  const [categoryStats, setCategoryStats] = useState<api.FPCategoryStats[]>([]);
  const [reporterStats, setReporterStats] = useState<api.FPReporterStats[]>([]);

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === 'overview') {
      loadOverviewData();
    } else if (activeTab === 'reports') {
      loadReportsData();
    } else if (activeTab === 'analytics') {
      loadAnalyticsData();
    }
  }, [activeTab, timeRange, currentPage, filterReason, filterReporter, filterStartDate, filterEndDate, filterMinScore, filterMaxScore]);

  const loadOverviewData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [stats, reasons, trend] = await Promise.all([
        api.fetchFPStats(),
        api.getFPStatsByReason(timeRange),
        api.getFPTrend(timeRange, 'day'),
      ]);
      setBasicStats(stats);
      setReasonStats(reasons);
      setTrendData(trend);
    } catch (err: any) {
      setError(err.message || 'Failed to load overview data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadReportsData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: api.FPReportListParams = {
        page: currentPage,
        pageSize,
        sortBy: 'report_timestamp',
        sortOrder: 'DESC',
      };

      if (filterReason) params.reason = filterReason;
      if (filterReporter) params.reportedBy = filterReporter;
      if (filterStartDate) params.startDate = filterStartDate;
      if (filterEndDate) params.endDate = filterEndDate;
      if (filterMinScore !== undefined) params.minScore = filterMinScore;
      if (filterMaxScore !== undefined) params.maxScore = filterMaxScore;

      const result = await api.getFPReportList(params);
      setReports(result.rows);
      setTotalReports(result.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAnalyticsData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [categories, reporters] = await Promise.all([
        api.getFPStatsByCategory(timeRange),
        api.getFPStatsByReporter(timeRange),
      ]);
      setCategoryStats(categories);
      setReporterStats(reporters);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReportClick = async (reportId: string) => {
    try {
      const details = await api.getFPReportDetails(reportId);
      setSelectedReport(details);
    } catch (err: any) {
      setError(err.message || 'Failed to load report details');
    }
  };

  const exportToCSV = () => {
    if (reports.length === 0) return;

    // CSV Header
    const headers = [
      'Report ID',
      'Event ID',
      'Reported By',
      'Reason',
      'Comment',
      'Report Timestamp',
      'Event Timestamp',
      'Final Status',
      'Threat Score',
      'Decision Reason',
      'Detected Categories',
      'Sanitizer Score',
      'PG Score %'
    ];

    // CSV Rows
    const rows = reports.map(report => [
      report.report_id,
      report.event_id,
      report.reported_by,
      report.reason,
      `"${(report.comment || '').replace(/"/g, '""')}"`, // Escape quotes
      new Date(report.report_timestamp).toISOString(),
      new Date(report.event_timestamp).toISOString(),
      report.final_status,
      report.threat_score.toFixed(2),
      `"${(report.decision_reason || '').replace(/"/g, '""')}"`,
      `"${report.detected_categories.join(', ')}"`,
      report.sanitizer_score,
      report.pg_score_percent.toFixed(2)
    ]);

    // Combine into CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `fp-reports-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearFilters = () => {
    setFilterReason('');
    setFilterReporter('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterMinScore(undefined);
    setFilterMaxScore(undefined);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalReports / pageSize);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">False Positive Reports</h1>
        <p className="text-text-secondary mt-2">
          Track and analyze user-reported false positives to improve detection accuracy
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-slate-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'reports'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
          >
            Reports
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'analytics'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
          >
            Analytics
          </button>
        </nav>
      </div>

      {/* Time Range Selector (Global) */}
      <div className="mb-6">
        <label className="text-text-secondary text-sm mr-3">Time Range:</label>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="7 DAY">Last 7 days</option>
          <option value="30 DAY">Last 30 days</option>
          <option value="90 DAY">Last 90 days</option>
          <option value="365 DAY">Last year</option>
        </select>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab stats={basicStats} reasonStats={reasonStats} trendData={trendData} isLoading={isLoading} />}
      {activeTab === 'reports' && (
        <ReportsTab
          reports={reports}
          totalReports={totalReports}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onReportClick={handleReportClick}
          onExportCSV={exportToCSV}
          isLoading={isLoading}
          filterReason={filterReason}
          setFilterReason={setFilterReason}
          filterReporter={filterReporter}
          setFilterReporter={setFilterReporter}
          filterStartDate={filterStartDate}
          setFilterStartDate={setFilterStartDate}
          filterEndDate={filterEndDate}
          setFilterEndDate={setFilterEndDate}
          filterMinScore={filterMinScore}
          setFilterMinScore={setFilterMinScore}
          filterMaxScore={filterMaxScore}
          setFilterMaxScore={setFilterMaxScore}
          clearFilters={clearFilters}
        />
      )}
      {activeTab === 'analytics' && <AnalyticsTab categoryStats={categoryStats} reporterStats={reporterStats} isLoading={isLoading} />}

      {/* Report Detail Modal */}
      {selectedReport && <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </div>
  );
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================

interface OverviewTabProps {
  stats: any;
  reasonStats: api.FPReasonStats[];
  trendData: api.FPTrendData[];
  isLoading: boolean;
}

function OverviewTab({ stats, reasonStats, trendData, isLoading }: OverviewTabProps) {
  if (isLoading) {
    return <div className="text-text-secondary">Loading overview...</div>;
  }

  return (
    <>
      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <StatCard label="Total Reports" value={stats?.total_reports || 0} />
        <StatCard label="Unique Events" value={stats?.unique_events || 0} />
        <StatCard label="Last 7 Days" value={stats?.last_7_days || 0} />
        <StatCard label="Top Reason" value={stats?.top_reason || 'N/A'} />
      </div>

      {/* FP Reports by Reason */}
      <div className="rounded-2xl border border-slate-700 p-6 mb-6 bg-surface-dark">
        <h2 className="text-lg font-semibold text-white mb-4">Reports by Reason</h2>
        {reasonStats.length === 0 ? (
          <p className="text-text-secondary">No data available</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 text-text-secondary text-sm font-medium">Reason</th>
                <th className="text-right py-2 text-text-secondary text-sm font-medium">Count</th>
                <th className="text-right py-2 text-text-secondary text-sm font-medium">Percentage</th>
                <th className="text-right py-2 text-text-secondary text-sm font-medium">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {reasonStats.map((stat) => (
                <tr key={stat.reason} className="border-b border-slate-700/50">
                  <td className="py-3 text-white">{stat.reason}</td>
                  <td className="py-3 text-white text-right font-mono">{stat.count}</td>
                  <td className="py-3 text-white text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 bg-slate-800 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${stat.percentage}%` }}
                        />
                      </div>
                      <span className="text-text-secondary text-sm">{stat.percentage.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 text-white text-right font-mono">{stat.avg_threat_score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* FP Trend Over Time */}
      <div className="rounded-2xl border border-slate-700 p-6 bg-surface-dark">
        <h2 className="text-lg font-semibold text-white mb-4">Trend Over Time</h2>
        {trendData.length === 0 ? (
          <p className="text-text-secondary">No data available</p>
        ) : (
          <div className="space-y-2">
            {trendData.map((item) => (
              <div key={item.date} className="flex items-center gap-4">
                <span className="text-text-secondary text-sm w-24">{item.date}</span>
                <div className="flex-1 bg-surface-base rounded-full h-6">
                  <div
                    className="bg-green-500 h-6 rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${(item.count / Math.max(...trendData.map((d) => d.count))) * 100}%` }}
                  >
                    <span className="text-white text-xs font-semibold">{item.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// REPORTS TAB
// ============================================================================

interface ReportsTabProps {
  reports: api.FPReportDetailed[];
  totalReports: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onReportClick: (reportId: string) => void;
  onExportCSV: () => void;
  isLoading: boolean;
  filterReason: string;
  setFilterReason: (value: string) => void;
  filterReporter: string;
  setFilterReporter: (value: string) => void;
  filterStartDate: string;
  setFilterStartDate: (value: string) => void;
  filterEndDate: string;
  setFilterEndDate: (value: string) => void;
  filterMinScore: number | undefined;
  setFilterMinScore: (value: number | undefined) => void;
  filterMaxScore: number | undefined;
  setFilterMaxScore: (value: number | undefined) => void;
  clearFilters: () => void;
}

function ReportsTab({
  reports,
  totalReports,
  currentPage,
  totalPages,
  onPageChange,
  onReportClick,
  onExportCSV,
  isLoading,
  filterReason,
  setFilterReason,
  filterReporter,
  setFilterReporter,
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  filterMinScore,
  setFilterMinScore,
  filterMaxScore,
  setFilterMaxScore,
  clearFilters,
}: ReportsTabProps) {
  return (
    <>
      {/* Search Filters */}
      <div className="mb-6 rounded-2xl border border-slate-700 p-6 bg-surface-dark">
        <h3 className="text-lg font-semibold text-white mb-4">Search Filters</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Reason Filter */}
          <div>
            <label className="block text-text-secondary text-sm mb-2">Reason</label>
            <select
              value={filterReason}
              onChange={(e) => setFilterReason(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Reasons</option>
              <option value="over_blocking">Over Blocking</option>
              <option value="over_sanitization">Over Sanitization</option>
              <option value="false_detection">False Detection</option>
              <option value="business_logic">Business Logic</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Reporter Filter */}
          <div>
            <label className="block text-text-secondary text-sm mb-2">Reporter</label>
            <input
              type="text"
              value={filterReporter}
              onChange={(e) => setFilterReporter(e.target.value)}
              placeholder="Username"
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-text-secondary text-sm mb-2">Start Date</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-text-secondary text-sm mb-2">End Date</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Score Range */}
          <div>
            <label className="block text-text-secondary text-sm mb-2">Min Score</label>
            <input
              type="number"
              value={filterMinScore ?? ''}
              onChange={(e) => setFilterMinScore(e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0"
              min="0"
              max="100"
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-text-secondary text-sm mb-2">Max Score</label>
            <input
              type="number"
              value={filterMaxScore ?? ''}
              onChange={(e) => setFilterMaxScore(e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="100"
              min="0"
              max="100"
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          onClick={clearFilters}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Clear Filters
        </button>
      </div>

      {/* Results Table */}
      <div className="rounded-2xl border border-slate-700 p-6 bg-surface-dark">
        <div className="mb-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">
            {totalReports} Reports Found
          </h3>
          <button
            onClick={onExportCSV}
            disabled={reports.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-text-muted disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export to CSV
          </button>
        </div>

        {isLoading ? (
          <div className="text-text-secondary">Loading reports...</div>
        ) : reports.length === 0 ? (
          <div className="text-text-secondary">No reports found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left py-2 text-text-secondary text-sm font-medium">Report ID</th>
                    <th className="text-left py-2 text-text-secondary text-sm font-medium">Reporter</th>
                    <th className="text-left py-2 text-text-secondary text-sm font-medium">Reason</th>
                    <th className="text-left py-2 text-text-secondary text-sm font-medium">Timestamp</th>
                    <th className="text-left py-2 text-text-secondary text-sm font-medium">Status</th>
                    <th className="text-right py-2 text-text-secondary text-sm font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr
                      key={report.report_id}
                      onClick={() => onReportClick(report.report_id)}
                      className="border-b border-border-muted hover:bg-surface-darker cursor-pointer transition-colors"
                    >
                      <td className="py-3 text-text-primary font-mono text-xs">
                        {report.report_id.substring(0, 8)}...
                      </td>
                      <td className="py-3 text-text-primary">{report.reported_by}</td>
                      <td className="py-3 text-text-primary">{report.reason}</td>
                      <td className="py-3 text-text-secondary text-sm">
                        {new Date(report.report_timestamp).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={report.final_status} />
                      </td>
                      <td className="py-3 text-text-primary text-right font-mono">
                        {report.threat_score.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center gap-2">
                <button
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-text-muted text-white rounded-md transition-colors"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-text-secondary">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-text-muted text-white rounded-md transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ============================================================================
// ANALYTICS TAB
// ============================================================================

interface AnalyticsTabProps {
  categoryStats: api.FPCategoryStats[];
  reporterStats: api.FPReporterStats[];
  isLoading: boolean;
}

function AnalyticsTab({ categoryStats, reporterStats, isLoading }: AnalyticsTabProps) {
  if (isLoading) {
    return <div className="text-text-secondary">Loading analytics...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Reports by Final Status */}
      <div className="rounded-2xl border border-slate-700 p-6 bg-surface-dark">
        <h2 className="text-lg font-semibold text-white mb-4">Reports by Final Status</h2>
        {categoryStats.length === 0 ? (
          <p className="text-text-secondary">No data available</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 text-text-secondary text-sm font-medium">Status</th>
                <th className="text-right py-2 text-text-secondary text-sm font-medium">Count</th>
                <th className="text-right py-2 text-text-secondary text-sm font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {categoryStats.map((stat) => (
                <tr key={stat.category} className="border-b border-slate-700/50">
                  <td className="py-3 text-white">{stat.category}</td>
                  <td className="py-3 text-white text-right font-mono">{stat.count}</td>
                  <td className="py-3 text-text-secondary text-right text-sm">{stat.percentage.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reports by User */}
      <div className="rounded-2xl border border-slate-700 p-6 bg-surface-dark">
        <h2 className="text-lg font-semibold text-white mb-4">Reports by User</h2>
        {reporterStats.length === 0 ? (
          <p className="text-text-secondary">No data available</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 text-text-secondary text-sm font-medium">Reporter</th>
                <th className="text-right py-2 text-text-secondary text-sm font-medium">Total</th>
                <th className="text-right py-2 text-text-secondary text-sm font-medium">Recent (7d)</th>
              </tr>
            </thead>
            <tbody>
              {reporterStats.map((stat) => (
                <tr key={stat.reported_by} className="border-b border-slate-700/50">
                  <td className="py-3 text-white">{stat.reported_by}</td>
                  <td className="py-3 text-white text-right font-mono">{stat.count}</td>
                  <td className="py-3 text-text-secondary text-right font-mono">{stat.recent_reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-700 p-6 bg-surface-dark">
      <div className="text-text-secondary text-sm mb-2">{label}</div>
      <div className="text-white text-2xl font-semibold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    ALLOWED: 'bg-emerald-500/20 text-emerald-400',
    SANITIZED: 'bg-yellow-500/20 text-yellow-400',
    BLOCKED: 'bg-red-500/20 text-red-400',
  };

  const color = colors[status as keyof typeof colors] || 'bg-slate-500/20 text-slate-400';

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function ReportDetailModal({ report, onClose }: { report: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-600 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Report Details</h2>
              <p className="text-sm text-slate-400 mt-1">Report ID: {report.report_id}</p>
              <p className="text-sm text-slate-400">Event ID: {report.event_id}</p>
              <p className="text-sm text-slate-400">
                {new Date(report.timestamp).toLocaleString()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Reporter and Reason */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Reporter</h3>
                <p className="text-white text-sm">{report.reported_by}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Reason</h3>
                <p className="text-white text-sm">{report.reason}</p>
              </div>
            </div>

            {/* Status & Score */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Final Status</h3>
                <StatusBadge status={report.final_status} />
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Threat Score</h3>
                <p className="text-white text-lg font-mono">{report.threat_score.toFixed(1)}</p>
              </div>
            </div>

            {/* Comment */}
            {report.comment && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Comment</h3>
                <p className="text-slate-300 text-sm whitespace-pre-wrap">{report.comment}</p>
              </div>
            )}

            {/* Original Input */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-2">Original Input</h3>
              <p className="text-white text-sm whitespace-pre-wrap break-words font-mono">
                {report.original_input}
              </p>
            </div>

            {/* Detected Categories */}
            {report.detected_categories && report.detected_categories.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Detected Categories</h3>
                <div className="flex flex-wrap gap-2">
                  {report.detected_categories.map((cat: string) => (
                    <span key={cat} className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-sm">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Pattern Matches */}
            {report.pattern_matches && report.pattern_matches.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Pattern Matches</h3>
                <pre className="text-slate-300 text-xs overflow-x-auto">{JSON.stringify(report.pattern_matches, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
