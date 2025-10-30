import React, { useState } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import ConfigLayout from "./components/ConfigLayout";
import ConfigSection from "./components/ConfigSection";
import GrafanaEmbed from "./components/GrafanaEmbed";
import PromptAnalyzer from "./components/PromptAnalyzer";
import Investigation from "./components/Investigation";
import { Login } from "./components/Login";
import { UserManagement } from "./components/UserManagement";
import { Settings } from "./components/Settings";
import { PluginConfiguration } from "./components/PluginConfiguration";
import { RetentionPolicy } from "./components/RetentionPolicy";
import { PIISettings } from "./components/PIISettings";
import Documentation from "./components/Documentation";
import { AuthProvider, ProtectedRoute } from "./context/AuthContext";
import { MobileProvider } from "./context/MobileContext";
import * as api from "./lib/api";

const Monitoring = () => {
  const GRAFANA_ORIGIN = import.meta.env.VITE_GRAFANA_ORIGIN || 'http://localhost/grafana';
  const [refreshInterval, setRefreshInterval] = useState<number>(30);
  const [timeRange, setTimeRange] = useState<string>("6h");
  const [stats, setStats] = useState({ requests_processed: 0, threats_blocked: 0, content_sanitized: 0 });
  const [fpStats, setFpStats] = useState({ total_reports: 0, unique_events: 0, last_7_days: 0, top_reason: 'N/A' });
  const [statsLoading, setStatsLoading] = useState(true);
  const [promptGuardStatus, setPromptGuardStatus] = useState<'active' | 'down' | 'checking'>('checking');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch stats from API
  const fetchStats = async () => {
    try {
      const data = await api.fetchStats24h(timeRange);
      setStats({
        requests_processed: Number(data.requests_processed) || 0,
        threats_blocked: Number(data.threats_blocked) || 0,
        content_sanitized: Number(data.content_sanitized) || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch FP stats from API
  const fetchFPStats = async () => {
    try {
      const data = await api.fetchFPStats();
      setFpStats({
        total_reports: Number(data.total_reports) || 0,
        unique_events: Number(data.unique_events) || 0,
        last_7_days: Number(data.last_7_days) || 0,
        top_reason: data.top_reason || 'N/A'
      });
    } catch (error) {
      console.error('Error fetching FP stats:', error);
    }
  };

  // Check Prompt Guard health
  const checkPromptGuard = async () => {
    const isHealthy = await api.checkPromptGuardHealth();
    setPromptGuardStatus(isHealthy ? 'active' : 'down');
  };

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchStats(), fetchFPStats()]);
      await checkPromptGuard();
    } catch (error) {
      console.error('Error during manual refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch stats on mount and when refreshInterval or timeRange changes
  React.useEffect(() => {
    fetchStats();
    fetchFPStats();
    checkPromptGuard();

    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchStats();
        fetchFPStats();
        checkPromptGuard();
      }, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, timeRange]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-semibold">LLM Guard Monitoring</h1>
          <p className="text-slate-400 mt-2">Real-time prompt injection detection and defense analytics.</p>
        </div>

        {/* Refresh Controls */}
        <div className="flex gap-4 items-center">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400">Time Range</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white"
            >
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="12h">Last 12 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400">Auto Refresh</label>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white"
            >
              <option value={0}>Off</option>
              <option value={10}>10 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
            </select>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      </div>
    <div className="mt-6 rounded-2xl border border-slate-700 p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">System Performance Dashboard</h2>
        <p className="text-sm text-slate-400">Real-time metrics from Vigil Guard monitoring</p>
      </div>
      {/* Full-width panel 1 - Input/Output Table */}
      <div className="mb-6">
        <div className="mb-3">
          <h3 className="text-md font-semibold text-white">Input/Output Processing Table</h3>
          <p className="text-xs text-slate-400">Real-time processing data with input/output analysis</p>
        </div>
        <GrafanaEmbed
          src={`${GRAFANA_ORIGIN}/d-solo/6cf14bba-9b61-45d7-82c3-04e1005dea38/vigil?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=1&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
          title="Vigil Input/Output Table"
          height="300"
          refreshInterval={refreshInterval}
        />
      </div>
    </div>

    {/* Prompt Analyzer Widget */}
    <PromptAnalyzer timeRange={timeRange} refreshInterval={refreshInterval} />

    <div className="mt-6 rounded-2xl border border-slate-700 p-4">
      {/* Full-width panel 5 - TOP-10 Detection Categories */}
      <div className="mb-6">
        <div className="mb-3">
          <h3 className="text-md font-semibold text-white">TOP-10 Detection Categories (Total Score)</h3>
          <p className="text-xs text-slate-400">Dominant abuse types analysis: identify which threats are most prevalent (e.g., JAILBREAK_ATTEMPT, CRITICAL_INJECTION)</p>
        </div>
        <GrafanaEmbed
          src={`${GRAFANA_ORIGIN}/d-solo/6cf14bba-9b61-45d7-82c3-04e1005dea38/vigil?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=5&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
          title="Vigil TOP-10 Detection Categories"
          height="300"
          refreshInterval={refreshInterval}
        />
      </div>

      {/* Half-width panel 2 - Volume + Status Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="mb-3">
            <h3 className="text-md font-semibold text-white">Volume + Decision Status (Stacked)</h3>
            <p className="text-xs text-slate-400">Prompt volume over time with ALLOWED / SANITIZED / BLOCKED status distribution</p>
          </div>
          <GrafanaEmbed
            src={`${GRAFANA_ORIGIN}/d-solo/6cf14bba-9b61-45d7-82c3-04e1005dea38/vigil?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=2&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
            title="Vigil Volume + Status Mix"
            height="250"
            refreshInterval={refreshInterval}
          />
        </div>

        {/* Panel 3 - Block Rate % */}
        <div>
          <div className="mb-3">
            <h3 className="text-md font-semibold text-white">Block Rate % Over Time</h3>
            <p className="text-xs text-slate-400">Percentage of BLOCKED requests - early indicator of traffic quality degradation or security effectiveness</p>
          </div>
          <GrafanaEmbed
            src={`${GRAFANA_ORIGIN}/d-solo/6cf14bba-9b61-45d7-82c3-04e1005dea38/vigil?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=3&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
            title="Vigil Block Rate Percentage"
            height="250"
            refreshInterval={refreshInterval}
          />
        </div>
      </div>

      {/* Panel 4 - Maliciousness Trend - Half width */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="mb-3">
            <h3 className="text-md font-semibold text-white">Maliciousness Trend — AVG & P95 Score</h3>
            <p className="text-xs text-slate-400">Risk trend analysis: Average smooths patterns, P95 captures tail risks and emerging threats</p>
          </div>
          <GrafanaEmbed
            src={`${GRAFANA_ORIGIN}/d-solo/6cf14bba-9b61-45d7-82c3-04e1005dea38/vigil?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=4&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
            title="Vigil Maliciousness Trend"
            height="250"
            refreshInterval={refreshInterval}
          />
        </div>

        {/* Panel 6 - Histogram Time Series */}
        <div>
          <div className="mb-3">
            <h3 className="text-md font-semibold text-white">Histogram "Time Series" (Stacked)</h3>
            <p className="text-xs text-slate-400">Distribution of buckets (0–10, 10–20, …) over time — ideal for Time series stacked visualization</p>
          </div>
          <GrafanaEmbed
            src={`${GRAFANA_ORIGIN}/d-solo/6cf14bba-9b61-45d7-82c3-04e1005dea38/vigil?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=6&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
            title="Vigil Histogram Time Series"
            height="250"
            refreshInterval={refreshInterval}
          />
        </div>
      </div>

      {/* Panel 7 - False Positive Reports Over Time - Full width */}
      <div className="mt-6">
        <div className="mb-3">
          <h3 className="text-md font-semibold text-white">False Positive Reports Over Time</h3>
          <p className="text-xs text-slate-400">Track user-reported false positives to identify over-blocking patterns and improve detection accuracy</p>
        </div>
        <GrafanaEmbed
          src={`${GRAFANA_ORIGIN}/d-solo/fp-monitoring-001/false-positive-monitoring?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=5&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
          title="False Positive Reports Over Time"
          height="250"
          refreshInterval={refreshInterval}
        />
      </div>
    </div>

    <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border border-slate-700 p-4">
        <div className="mb-4">
          <h3 className="text-md font-semibold text-white">System Status</h3>
          <p className="text-xs text-slate-400">Current operational metrics</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">System Health</span>
              <span className="text-emerald-400 font-semibold">✓ Operational</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">LLM Processing</span>
              <span className="text-emerald-400 font-semibold">✓ Active</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">Configuration</span>
              <span className="text-emerald-400 font-semibold">✓ Valid</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 p-4" role="region" aria-label="System statistics summary">
        <div className="mb-4">
          <h3 id="quick-stats-heading" className="text-md font-semibold text-white">Quick Stats</h3>
          <p className="text-xs text-text-secondary" aria-live="polite">
            {timeRange === '1h' && 'Last 1 hour'}
            {timeRange === '6h' && 'Last 6 hours'}
            {timeRange === '12h' && 'Last 12 hours'}
            {timeRange === '24h' && 'Last 24 hours'}
            {timeRange === '7d' && 'Last 7 days'}
          </p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-4">
          {statsLoading ? (
            <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" aria-label="Loading statistics"></div>
              <span className="sr-only">Loading statistics...</span>
            </div>
          ) : (
            <div className="space-y-3" aria-labelledby="quick-stats-heading">
              <div className="flex justify-between items-center">
                <span id="stat-prompt-guard" className="text-sm text-slate-300">Prompt Guard Status</span>
                {promptGuardStatus === 'checking' ? (
                  <span className="text-text-secondary font-semibold" aria-labelledby="stat-prompt-guard">⏳ Checking...</span>
                ) : promptGuardStatus === 'active' ? (
                  <span className="text-emerald-400 font-semibold" aria-labelledby="stat-prompt-guard">✓ Active</span>
                ) : (
                  <span className="text-red-400 font-semibold" aria-labelledby="stat-prompt-guard">✗ Down</span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span id="stat-requests" className="text-sm text-slate-300">Requests Processed</span>
                <span className="text-blue-400 font-mono" aria-labelledby="stat-requests">{stats.requests_processed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span id="stat-threats" className="text-sm text-slate-300">Threats Blocked</span>
                <span className="text-red-400 font-mono" aria-labelledby="stat-threats">{stats.threats_blocked.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span id="stat-sanitized" className="text-sm text-slate-300">Content Sanitized</span>
                <span className="text-yellow-400 font-mono" aria-labelledby="stat-sanitized">{stats.content_sanitized.toLocaleString()}</span>
              </div>
              <div className="border-t border-slate-700 my-2" role="separator"></div>
              <div className="flex justify-between items-center">
                <span id="stat-fp-total" className="text-sm text-slate-300">FP Reports (Total)</span>
                <span className="text-orange-400 font-mono" aria-labelledby="stat-fp-total">{fpStats.total_reports.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span id="stat-fp-7d" className="text-sm text-slate-300">FP Reports (7 days)</span>
                <span className="text-orange-400 font-mono" aria-labelledby="stat-fp-7d">{fpStats.last_7_days.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
};

// Error fallback component
const NotFound = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-white mb-4">404</h1>
      <p className="text-gray-400">Page not found</p>
    </div>
  </div>
);

export const router = createBrowserRouter(
  [
    {
      path: "/login",
      element: (
        <MobileProvider>
          <AuthProvider>
            <Login />
          </AuthProvider>
        </MobileProvider>
      )
    },
    {
      path: "/",
      element: (
        <MobileProvider>
          <AuthProvider>
            <ProtectedRoute>
              <App />
            </ProtectedRoute>
          </AuthProvider>
        </MobileProvider>
      ),
      children: [
        { path: "/", element: <Monitoring /> },
        { path: "/investigation", element: <Investigation /> },
        {
          path: "/config",
          element: <ConfigLayout />,
          children: [
            { path: "/config", element: <Navigate to="/config/overview" replace /> },
            { path: "/config/plugin", element: <PluginConfiguration /> },
            { path: "/config/pii", element: <PIISettings /> },
            { path: "/config/retention", element: <RetentionPolicy /> },
            { path: "/config/:sectionId", element: <ConfigSection /> }
          ]
        },
        { path: "/administration", element: <UserManagement /> },
        { path: "/settings", element: <Settings /> },
        { path: "/help", element: <Documentation /> }
      ]
    },
    {
      path: "*",
      element: <NotFound />
    }
  ],
  { basename: "/ui" }
);
