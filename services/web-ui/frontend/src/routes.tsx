import React, { useState } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import ConfigLayout from "./components/ConfigLayout";
import ConfigSection from "./components/ConfigSection";
import GrafanaEmbed from "./components/GrafanaEmbed";
import PromptAnalyzer from "./components/PromptAnalyzer";
import Investigation from "./components/Investigation";
import InvestigationV2 from "./components/InvestigationV2";
import { Login } from "./components/Login";
import { UserManagement } from "./components/UserManagement";
import { Settings } from "./components/Settings";
import { PluginConfiguration } from "./components/PluginConfiguration";
import { RetentionPolicy } from "./components/RetentionPolicy";
import { PIISettings } from "./components/PIISettings";
import ArbiterSettings from "./components/ArbiterSettings";
import FPReporting from "./components/FPReporting";
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
  const [containerStatus, setContainerStatus] = useState<any>(null);
  const [containerLoading, setContainerLoading] = useState(true);

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

  // Fetch container status
  const fetchContainerStatus = async () => {
    try {
      setContainerLoading(true);
      const data = await api.fetchContainerStatus();
      setContainerStatus(data);
    } catch (error) {
      console.error('Error fetching container status:', error);
      setContainerStatus(null);
    } finally {
      setContainerLoading(false);
    }
  };

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchStats(), fetchFPStats(), fetchContainerStatus()]);
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
    fetchContainerStatus();

    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchStats();
        fetchFPStats();
        checkPromptGuard();
        fetchContainerStatus();
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
      {/* Full-width panel - Recent Events Table (3-Branch) */}
      <div className="mb-6">
        <div className="mb-3">
          <h3 className="text-md font-semibold text-white">Recent Events (3-Branch Architecture)</h3>
          <p className="text-xs text-slate-400">Real-time processing data with branch scores and decision analysis</p>
        </div>
        <GrafanaEmbed
          src={`${GRAFANA_ORIGIN}/d-solo/vigil-v2-3branch/vigil-guard-v2?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=30&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
          title="Vigil Recent Events Table"
          height="350"
          refreshInterval={refreshInterval}
        />
      </div>
    </div>

    {/* Prompt Analyzer Widget */}
    <PromptAnalyzer timeRange={timeRange} refreshInterval={refreshInterval} />

    <div className="mt-6 rounded-2xl border border-slate-700 p-4">
      {/* Priority Boosts Applied - Detection Categories */}
      <div className="mb-6">
        <div className="mb-3">
          <h3 className="text-md font-semibold text-white">Priority Boosts Applied</h3>
          <p className="text-xs text-slate-400">Arbiter priority boosts: identify which security rules are triggering most frequently</p>
        </div>
        <GrafanaEmbed
          src={`${GRAFANA_ORIGIN}/d-solo/vigil-v2-3branch/vigil-guard-v2?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=21&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
          title="Vigil Priority Boosts Applied"
          height="300"
          refreshInterval={refreshInterval}
        />
      </div>

      {/* Decision Distribution + Threat Score Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="mb-3">
            <h3 className="text-md font-semibold text-white">Decision Distribution</h3>
            <p className="text-xs text-slate-400">Distribution of ALLOWED / SANITIZED / BLOCKED decisions across all events</p>
          </div>
          <GrafanaEmbed
            src={`${GRAFANA_ORIGIN}/d-solo/vigil-v2-3branch/vigil-guard-v2?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=20&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
            title="Vigil Decision Distribution"
            height="250"
            refreshInterval={refreshInterval}
          />
        </div>

        {/* Threat Score Distribution */}
        <div>
          <div className="mb-3">
            <h3 className="text-md font-semibold text-white">Threat Score Distribution</h3>
            <p className="text-xs text-slate-400">Distribution of threat scores across 0-100 range - identify risk patterns</p>
          </div>
          <GrafanaEmbed
            src={`${GRAFANA_ORIGIN}/d-solo/vigil-v2-3branch/vigil-guard-v2?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=22&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
            title="Vigil Threat Score Distribution"
            height="250"
            refreshInterval={refreshInterval}
          />
        </div>
      </div>

      {/* Branch Scores Over Time + Branch Avg Scores */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="mb-3">
            <h3 className="text-md font-semibold text-white">Branch Scores Over Time</h3>
            <p className="text-xs text-slate-400">3-Branch detection trends: Heuristics (A), Semantic (B), LLM Guard (C)</p>
          </div>
          <GrafanaEmbed
            src={`${GRAFANA_ORIGIN}/d-solo/vigil-v2-3branch/vigil-guard-v2?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=10&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
            title="Vigil Branch Scores Over Time"
            height="250"
            refreshInterval={refreshInterval}
          />
        </div>

        {/* Branch Average Scores */}
        <div>
          <div className="mb-3">
            <h3 className="text-md font-semibold text-white">Branch Average Scores (24h)</h3>
            <p className="text-xs text-slate-400">Average detection scores per branch: Heuristics, Semantic, LLM Guard</p>
          </div>
          <GrafanaEmbed
            src={`${GRAFANA_ORIGIN}/d-solo/vigil-v2-3branch/vigil-guard-v2?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=11&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
            title="Vigil Branch Avg Scores"
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
          <p className="text-xs text-slate-400">Current operational metrics - Docker containers health</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-4">
          {containerLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : containerStatus ? (
            <div className="space-y-3">
              {/* Overall System Health */}
              <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                <span className="text-sm text-slate-300 font-semibold">System Health</span>
                {containerStatus.overall_status === 'healthy' ? (
                  <span className="text-emerald-400 font-semibold">✓ Operational ({containerStatus.summary.healthy}/{containerStatus.summary.total})</span>
                ) : containerStatus.overall_status === 'degraded' ? (
                  <span className="text-yellow-400 font-semibold">⚠ Degraded ({containerStatus.summary.healthy}/{containerStatus.summary.total})</span>
                ) : (
                  <span className="text-red-400 font-semibold">✗ Critical ({containerStatus.summary.healthy}/{containerStatus.summary.total})</span>
                )}
              </div>

              {/* Individual Container Statuses */}
              {containerStatus.containers.map((container: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">{container.name}</span>
                  {container.status === 'healthy' ? (
                    <span className="text-emerald-400">✓ Healthy</span>
                  ) : container.status === 'degraded' ? (
                    <span className="text-yellow-400">⚠ {container.details || 'Degraded'}</span>
                  ) : (
                    <span className="text-red-400">✗ {container.details || 'Offline'}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-red-400 py-4">
              Failed to load container status
            </div>
          )}
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
        { path: "/investigation", element: <InvestigationV2 /> },
        { path: "/investigation-legacy", element: <Investigation /> },
        { path: "/fp-reporting", element: <FPReporting /> },
        {
          path: "/config",
          element: <ConfigLayout />,
          children: [
            { path: "/config", element: <Navigate to="/config/overview" replace /> },
            { path: "/config/arbiter", element: <ArbiterSettings /> },
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
