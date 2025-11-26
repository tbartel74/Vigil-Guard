// Use environment variable if set (dev), otherwise use production path
// In dev: Vite proxy will handle /api -> localhost:8787/api
// In prod: Caddy serves at /ui/api
const API = import.meta.env.VITE_API_BASE || "/ui/api";

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

// Helper function for authenticated fetch
async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers
    },
    credentials: 'include'
  });

  // If unauthorized, redirect to login
  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/ui/login';
    throw new Error('Session expired. Please login again.');
  }

  return response;
}

export async function listFiles(ext: "json" | "conf" | "all" = "all") {
  const r = await authenticatedFetch(`${API}/files?ext=${ext}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchFile(name: string) {
  const r = await authenticatedFetch(`${API}/file/${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function parseFile(name: string) {
  const r = await authenticatedFetch(`${API}/parse/${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function resolveSpec(spec: any) {
  const r = await authenticatedFetch(`${API}/resolve`, {
    method: "POST",
    body: JSON.stringify({ spec })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveChanges(payload: { changes: any[]; spec: any; changeTag: string; ifMatch?: string | Record<string, string>; }) {
  const r = await authenticatedFetch(`${API}/save`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (r.status === 409) {
    const data = await r.json();
    throw Object.assign(new Error("File changed on disk"), { conflict: data });
  }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// User Management API
export async function getUsers() {
  const r = await authenticatedFetch(`${API}/auth/users`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createUser(userData: any) {
  const r = await authenticatedFetch(`${API}/auth/users`, {
    method: "POST",
    body: JSON.stringify(userData)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateUser(userId: number, updates: any) {
  const r = await authenticatedFetch(`${API}/auth/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(updates)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteUser(userId: number) {
  const r = await authenticatedFetch(`${API}/auth/users/${userId}`, {
    method: "DELETE"
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function toggleUserActive(userId: number) {
  const r = await authenticatedFetch(`${API}/auth/users/${userId}/toggle-active`, {
    method: "POST"
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function forcePasswordChange(userId: number) {
  const r = await authenticatedFetch(`${API}/auth/users/${userId}/force-password-change`, {
    method: "POST"
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const r = await authenticatedFetch(`${API}/auth/change-password`, {
    method: "POST",
    body: JSON.stringify({
      currentPassword,
      newPassword
    })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateSettings(settings: { timezone: string }) {
  const r = await authenticatedFetch(`${API}/auth/settings`, {
    method: "PUT",
    body: JSON.stringify(settings)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchStats24h(timeRange?: string) {
  const url = timeRange
    ? `${API}/stats/24h?timeRange=${encodeURIComponent(timeRange)}`
    : `${API}/stats/24h`;
  const r = await authenticatedFetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function checkPromptGuardHealth() {
  try {
    // Check Prompt Guard API health via backend proxy
    const r = await authenticatedFetch(`${API}/prompt-guard/health`);
    if (!r.ok) return false;
    const data = await r.json();
    return data.status === 'healthy' && data.model_loaded === true;
  } catch (error) {
    return false;
  }
}

export async function fetchContainerStatus() {
  try {
    const r = await authenticatedFetch(`${API}/system/containers`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  } catch (error) {
    console.error('Failed to fetch container status:', error);
    throw error;
  }
}

export async function fetchPromptList(timeRange: string) {
  // v2.0.0: Use events-v2/list endpoint
  const r = await authenticatedFetch(`${API}/events-v2/list?timeRange=${encodeURIComponent(timeRange)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchPromptDetails(id: string) {
  // v2.0.0: Use events-v2/:id endpoint
  const r = await authenticatedFetch(`${API}/events-v2/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Configuration File Manager API
export async function listConfigFiles() {
  const r = await authenticatedFetch(`${API}/config-files/list`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function downloadConfigFile(filename: string) {
  const r = await authenticatedFetch(`${API}/config-files/download/${encodeURIComponent(filename)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.text();
}

export async function uploadConfigFile(expectedFilename: string, content: string, actualFilename: string) {
  const r = await authenticatedFetch(`${API}/config-files/upload/${encodeURIComponent(expectedFilename)}`, {
    method: "POST",
    body: JSON.stringify({ content, filename: actualFilename })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchAuditLog() {
  const r = await authenticatedFetch(`${API}/config-files/audit-log`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// False Positive Feedback API
export interface FalsePositiveReport {
  event_id: string;
  report_type?: 'FP' | 'TP';  // Optional, defaults to 'FP' on backend
  reason: string;
  comment: string;
  event_timestamp?: string;
  original_input?: string;
  final_status?: string;
  threat_score?: number;
}

export async function submitFalsePositiveReport(report: FalsePositiveReport) {
  const r = await authenticatedFetch(`${API}/feedback/false-positive`, {
    method: "POST",
    body: JSON.stringify(report)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchFPStats() {
  const r = await authenticatedFetch(`${API}/feedback/stats`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ============================================================================
// FALSE POSITIVE DETAILED REPORTING API
// ============================================================================

export interface FPReportDetailed {
  report_id: string;
  event_id: string;
  reported_by: string;
  report_type: 'FP' | 'TP';  // Report type: False Positive or True Positive
  reason: string;
  comment: string;
  report_timestamp: string;
  event_timestamp: string;
  original_input: string;
  final_status: string;
  threat_score: number;
  detected_categories: string[];
  sanitizer_score: number;
  pg_score_percent: number;
  decision_reason: string; // internal_note from final_decision_json

  // Decision Analysis fields
  final_action: string;
  removal_pct: number;
  processing_time_ms: number;
  pii_sanitized: number;
  pii_types_detected: string[];
  pii_entities_count: number;
  detected_language: string;
  decision_source: string;

  // Additional fields from events_v2 (for full branch analysis rendering like Monitoring)
  branch_a_score?: number;
  branch_b_score?: number;
  branch_c_score?: number;
  confidence?: number;
  boosts_applied?: string[];
  chat_input?: string;
  result?: string;
  client_id?: string;
  browser_name?: string;
  browser_version?: string;
  os_name?: string;
  pipeline_version?: string;
  config_version?: string;

  // RAW JSON fields (parsed) - same as EventV2Details for rendering detailed branch analysis
  arbiter_json?: any;
  branch_results_json?: any;
  pii_classification_json?: any;

  // Parsed JSON objects (only in detail view from getFPReportDetails)
  scoring_breakdown?: {
    sanitizer_score: number;
    prompt_guard_score: number;
    prompt_guard_percent: number;
    threat_score: number;
    score_breakdown: Record<string, number>;
    match_details: Array<{
      category: string;
      matchCount: number;
      score: number;
      matches: Array<{
        pattern: string;
        samples: string[];
      }>;
    }>;
  };

  sanitizer_breakdown?: {
    decision: string;
    removal_pct: number;
    mode?: string;
    score: number;
    breakdown: Record<string, number>;
    pii?: {
      has: boolean;
      entities_detected: number;
      detection_method: string;
      processing_time_ms: number;
      language_stats: {
        detected_language: string;
        detection_confidence: number;
        detection_method: string;
        polish_entities: number;
        english_entities: number;
        regex_entities: number;
      };
      entities: Array<{
        type: string;
        start: number;
        end: number;
        score: number;
      }>;
    };
  };

  final_decision?: {
    status: string;
    action_taken: string;
    source: string;
    internal_note: string;
  };

  pipeline_flow?: {
    input_raw: string;
    input_normalized: string;
    after_sanitization: string;
    after_pii_redaction: string;
    output_final: string;
    output_status: string;
  };

  pattern_matches?: Array<{
    category: string;
    matchCount: number;
    score: number;
    matches: Array<{
      pattern: string;
      samples: string[];
    }>;
  }>;
}

export interface FPReportListParams {
  startDate?: string;
  endDate?: string;
  reportType?: 'FP' | 'TP' | 'ALL';  // Filter by report type (default: ALL)
  reason?: string;
  reportedBy?: string;
  minScore?: number;
  maxScore?: number;
  sortBy?: 'report_timestamp' | 'event_timestamp' | 'threat_score';
  sortOrder?: 'ASC' | 'DESC';
  page: number;
  pageSize: number;
}

export interface FPReportListResponse {
  rows: FPReportDetailed[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export async function getFPReportList(params: FPReportListParams): Promise<FPReportListResponse> {
  const queryParams = new URLSearchParams();

  if (params.startDate) queryParams.set('startDate', params.startDate);
  if (params.endDate) queryParams.set('endDate', params.endDate);
  if (params.reportType) queryParams.set('reportType', params.reportType);
  if (params.reason) queryParams.set('reason', params.reason);
  if (params.reportedBy) queryParams.set('reportedBy', params.reportedBy);
  if (params.minScore !== undefined) queryParams.set('minScore', String(params.minScore));
  if (params.maxScore !== undefined) queryParams.set('maxScore', String(params.maxScore));
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
  queryParams.set('page', String(params.page));
  queryParams.set('pageSize', String(params.pageSize));

  const r = await authenticatedFetch(`${API}/feedback/reports?${queryParams.toString()}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface FPReasonStats {
  reason: string;
  count: number;
  percentage: number;
  avg_threat_score: number;
}

export async function getFPStatsByReason(timeRange: string = '30 DAY'): Promise<FPReasonStats[]> {
  const r = await authenticatedFetch(`${API}/feedback/stats/by-reason?timeRange=${encodeURIComponent(timeRange)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface FPReporterStats {
  reported_by: string;
  count: number;
  recent_reports: number;
}

export async function getFPStatsByReporter(timeRange: string = '30 DAY'): Promise<FPReporterStats[]> {
  const r = await authenticatedFetch(`${API}/feedback/stats/by-reporter?timeRange=${encodeURIComponent(timeRange)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface FPCategoryStats {
  category: string;
  count: number;
  percentage: number;
}

export async function getFPStatsByCategory(timeRange: string = '30 DAY'): Promise<FPCategoryStats[]> {
  const r = await authenticatedFetch(`${API}/feedback/stats/by-category?timeRange=${encodeURIComponent(timeRange)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface FPTrendData {
  date: string;
  count: number;
}

export async function getFPTrend(timeRange: string = '30 DAY', interval: 'day' | 'week' = 'day'): Promise<FPTrendData[]> {
  const r = await authenticatedFetch(`${API}/feedback/stats/trend?timeRange=${encodeURIComponent(timeRange)}&interval=${interval}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getFPReportDetails(reportId: string): Promise<FPReportDetailed & {
  scoring_breakdown: any;
  pattern_matches: any[];
  pipeline_flow: any;
}> {
  const r = await authenticatedFetch(`${API}/feedback/reports/${encodeURIComponent(reportId)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Configuration Version History API
export interface ConfigVersion {
  tag: string;
  timestamp: string;
  author: string;
  files: string[];
  backups: string[];
}

export async function getConfigVersions() {
  const r = await authenticatedFetch(`${API}/config-versions`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getVersionDetails(tag: string) {
  const r = await authenticatedFetch(`${API}/config-version/${encodeURIComponent(tag)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function rollbackToVersion(tag: string) {
  const r = await authenticatedFetch(`${API}/config-rollback/${encodeURIComponent(tag)}`, {
    method: "POST"
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ============================================================================
// INVESTIGATION - ADVANCED PROMPT SEARCH
// ============================================================================

export interface SearchParams {
  startDate?: string;
  endDate?: string;
  textQuery?: string;
  clientId?: string;  // NEW v1.7.0: Filter by browser client ID
  status?: 'ALLOWED' | 'SANITIZED' | 'BLOCKED' | null;
  minScore?: number;
  maxScore?: number;
  categories?: string[];
  sortBy?: 'timestamp' | 'threat_score' | 'final_status';
  sortOrder?: 'ASC' | 'DESC';
  page: number;
  pageSize: number;
}

export interface SearchResultRow {
  event_id: string;
  timestamp: string;
  client_id: string;        // NEW v1.7.0: Persistent browser instance identifier
  prompt_input: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  threat_score: number;
  detected_categories: string[];
  pipeline_flow: string;    // JSON: input_raw, normalized, sanitized, final output
  scoring: string;          // JSON: score_breakdown, match_details with patterns
  prompt_guard: string;     // JSON: PG score, risk_level, confidence
  final_decision: string;   // JSON: action_taken, internal_note, source
  sanitizer: string;        // JSON: decision, breakdown, removal_pct
  // NEW v1.7.0: Browser metadata (available in detail view)
  browser_name?: string;
  browser_version?: string;
  browser_language?: string;
  browser_timezone?: string;
  os_name?: string;
}

export interface SearchResponse {
  results: SearchResultRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export async function searchPrompts(params: SearchParams): Promise<SearchResponse> {
  const queryParams = new URLSearchParams();

  // Add all non-null/undefined parameters
  if (params.startDate) queryParams.set('startDate', params.startDate);
  if (params.endDate) queryParams.set('endDate', params.endDate);
  if (params.textQuery) queryParams.set('textQuery', params.textQuery);
  if (params.clientId) queryParams.set('clientId', params.clientId);  // NEW v1.7.0
  if (params.status) queryParams.set('status', params.status);
  if (params.minScore !== undefined && params.minScore !== null) queryParams.set('minScore', String(params.minScore));
  if (params.maxScore !== undefined && params.maxScore !== null) queryParams.set('maxScore', String(params.maxScore));
  if (params.categories && params.categories.length > 0) queryParams.set('categories', params.categories.join(','));
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
  queryParams.set('page', String(params.page));
  queryParams.set('pageSize', String(params.pageSize));

  const r = await authenticatedFetch(`${API}/prompts/search?${queryParams.toString()}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function exportPrompts(params: Omit<SearchParams, 'page' | 'pageSize'>, format: 'csv' | 'json'): Promise<Blob> {
  const queryParams = new URLSearchParams();

  queryParams.set('format', format);
  if (params.startDate) queryParams.set('startDate', params.startDate);
  if (params.endDate) queryParams.set('endDate', params.endDate);
  if (params.textQuery) queryParams.set('textQuery', params.textQuery);
  if (params.status) queryParams.set('status', params.status);
  if (params.minScore !== undefined && params.minScore !== null) queryParams.set('minScore', String(params.minScore));
  if (params.maxScore !== undefined && params.maxScore !== null) queryParams.set('maxScore', String(params.maxScore));
  if (params.categories && params.categories.length > 0) queryParams.set('categories', params.categories.join(','));
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

  const r = await authenticatedFetch(`${API}/prompts/export?${queryParams.toString()}`);
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}

// ============================================================================
// EVENTS V2 API (3-Branch Detection Architecture)
// ============================================================================

export interface SearchParamsV2 {
  startDate?: string;
  endDate?: string;
  textQuery?: string;
  clientId?: string;
  status?: 'ALLOWED' | 'SANITIZED' | 'BLOCKED' | null;
  minScore?: number;
  maxScore?: number;
  boostFilter?: string;  // Filter by applied boost
  sortBy?: 'timestamp' | 'threat_score' | 'final_status' | 'branch_a_score' | 'branch_b_score' | 'branch_c_score';
  sortOrder?: 'ASC' | 'DESC';
  page: number;
  pageSize: number;
}

export interface EventV2Row {
  id: string;  // UUID from events_v2
  sessionId?: string;  // Optional, only in details view
  timestamp: string;
  client_id?: string;
  original_input: string;
  chat_input?: string;
  result?: string;
  detected_language?: string;
  branch_a_score: number;  // Heuristics
  branch_b_score: number;  // Semantic
  branch_c_score: number;  // NLP analysis (llm_guard)
  threat_score: number;    // Combined weighted score
  confidence: number;
  boosts_applied: string[];
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  final_decision: 'ALLOW' | 'BLOCK';
  pii_sanitized: boolean;
  pii_types_detected: string[];
  pii_entities_count: number;
  preview?: string;  // Truncated original_input for list view
  arbiter_json?: any;  // Parsed JSON object
  branch_results_json?: any;  // Parsed JSON object
  pii_classification_json?: {  // Parsed PII classification object
    types: string[];
    count: number;
    method: string;
    sanitization_applied?: boolean;
  };
}

export interface SearchResponseV2 {
  results: EventV2Row[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface QuickStatsV2 {
  requests_processed: number;
  threats_blocked: number;
  content_sanitized: number;  // SANITIZED status = PII redacted
  pii_sanitized: number;
}

export interface BranchStats {
  branch_a_avg: number;
  branch_b_avg: number;
  branch_c_avg: number;
  threat_score_avg: number;
  confidence_avg: number;
}

export interface BranchHealthStatus {
  heuristics: { status: string; latency_ms: number };
  semantic: { status: string; latency_ms: number };
  llm_guard: { status: string; latency_ms: number };
}

/**
 * Get quick stats for events_v2 table (v2.0.0 3-branch architecture)
 */
export async function getEventsV2Stats(timeRange = '24h'): Promise<QuickStatsV2> {
  const r = await authenticatedFetch(`${API}/events-v2/stats?timeRange=${timeRange}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/**
 * Get average scores for each branch
 */
export async function getBranchStats(timeRange = '24h'): Promise<BranchStats> {
  const r = await authenticatedFetch(`${API}/events-v2/branch-stats?timeRange=${timeRange}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/**
 * Get health status for all 3 branches
 * Transforms API response format to match BranchHealthStatus interface
 */
export async function getBranchHealth(): Promise<BranchHealthStatus> {
  const r = await authenticatedFetch(`${API}/branches/health`);
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();

  // API returns { branches: { A: {...}, B: {...}, C: {...} } }
  // Transform to { heuristics: {...}, semantic: {...}, llm_guard: {...} } (llm_guard = NLP analysis branch)
  if (data.branches) {
    return {
      heuristics: data.branches.A || { status: 'unknown', latency_ms: 0 },
      semantic: data.branches.B || { status: 'unknown', latency_ms: 0 },
      llm_guard: data.branches.C || { status: 'unknown', latency_ms: 0 },
    };
  }

  // Fallback for direct format
  return data;
}

/**
 * Search events in events_v2 table
 */
export async function searchEventsV2(params: SearchParamsV2): Promise<SearchResponseV2> {
  const queryParams = new URLSearchParams();

  if (params.startDate) queryParams.set('startDate', params.startDate);
  if (params.endDate) queryParams.set('endDate', params.endDate);
  if (params.textQuery) queryParams.set('textQuery', params.textQuery);
  if (params.clientId) queryParams.set('clientId', params.clientId);
  if (params.status) queryParams.set('status', params.status);
  if (params.minScore !== undefined) queryParams.set('minScore', String(params.minScore));
  if (params.maxScore !== undefined) queryParams.set('maxScore', String(params.maxScore));
  if (params.boostFilter) queryParams.set('boostFilter', params.boostFilter);
  if (params.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);
  queryParams.set('page', String(params.page));
  queryParams.set('pageSize', String(params.pageSize));

  const r = await authenticatedFetch(`${API}/events-v2/search?${queryParams.toString()}`);
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  // Backend returns 'rows', frontend expects 'results'
  return {
    results: data.rows || [],
    total: data.total || 0,
    page: data.page || 1,
    pageSize: data.pageSize || 25,
    pages: data.pages || 0,
  };
}

/**
 * Get list of events from events_v2 table
 */
export async function getEventsV2List(page = 1, pageSize = 25, timeRange = '24h'): Promise<SearchResponseV2> {
  const r = await authenticatedFetch(`${API}/events-v2/list?page=${page}&pageSize=${pageSize}&timeRange=${timeRange}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/**
 * Get detailed event by event_id
 */
export async function getEventV2Details(eventId: string): Promise<EventV2Row> {
  const r = await authenticatedFetch(`${API}/events-v2/${encodeURIComponent(eventId)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/**
 * Get status distribution (pie chart data)
 */
export async function getStatusDistribution(timeRange = '24h'): Promise<{ status: string; count: number }[]> {
  const r = await authenticatedFetch(`${API}/events-v2/status-distribution?timeRange=${timeRange}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/**
 * Get boost statistics
 */
export async function getBoostStats(timeRange = '24h'): Promise<{ boost: string; count: number }[]> {
  const r = await authenticatedFetch(`${API}/events-v2/boost-stats?timeRange=${timeRange}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ============================================================================
// RETENTION POLICY API
// ============================================================================

export interface RetentionConfig {
  id: number;
  events_raw_ttl_days: number;
  events_processed_ttl_days: number;
  merge_with_ttl_timeout_seconds: number;
  ttl_only_drop_parts: number;
  warn_disk_usage_percent: number;
  critical_disk_usage_percent: number;
  last_modified_at: string;
  last_modified_by: string;
}

export interface DiskUsageStats {
  table_name: string;
  total_rows: number;
  total_bytes: number;
  total_bytes_human: string;
  compressed_bytes: number;
  compressed_bytes_human: string;
  partition_count: number;
  oldest_partition: string;
  newest_partition: string;
  compression_ratio: number;
}

export interface SystemDiskStats {
  total_space: number;
  total_space_human: string;
  free_space: number;
  free_space_human: string;
  used_space: number;
  used_space_human: string;
  used_percent: number;
}

export interface DiskUsageResponse {
  success: boolean;
  tables: DiskUsageStats[];
  system: SystemDiskStats;
}

/**
 * Get current retention policy configuration
 */
export async function getRetentionConfig(): Promise<{ success: boolean; config: RetentionConfig }> {
  const r = await authenticatedFetch(`${API}/retention/config`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/**
 * Update retention policy configuration
 */
export async function updateRetentionConfig(updates: Partial<RetentionConfig>): Promise<{ success: boolean; config: RetentionConfig; message: string }> {
  const r = await authenticatedFetch(`${API}/retention/config`, {
    method: "PUT",
    body: JSON.stringify(updates)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/**
 * Get disk usage statistics
 */
export async function getRetentionDiskUsage(): Promise<DiskUsageResponse> {
  const r = await authenticatedFetch(`${API}/retention/disk-usage`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/**
 * Force immediate cleanup of expired data
 */
export async function forceRetentionCleanup(table: 'events_raw' | 'events_processed' | 'all'): Promise<{ success: boolean; message: string }> {
  const r = await authenticatedFetch(`${API}/retention/cleanup`, {
    method: "POST",
    body: JSON.stringify({ table })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/**
 * Get partition information for a table
 */
export async function getRetentionPartitions(table: 'events_raw' | 'events_processed'): Promise<{ success: boolean; table: string; partitions: any[] }> {
  const r = await authenticatedFetch(`${API}/retention/partitions/${table}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ============================================================================
// PII CONFIGURATION SYNC API
// ============================================================================

export interface SyncPiiConfigPayload {
  enabled?: boolean;
  confidenceThreshold?: number;
  enabledEntities?: string[];
  redactionMode?: 'replace' | 'hash' | 'mask';
  fallbackToRegex?: boolean;
  languages?: string[];
  detectionMode?: 'balanced' | 'high_security' | 'high_precision';
  contextEnhancement?: boolean;
  redactionTokens?: Record<string, string>;
  etags?: Record<string, string>;
}

export interface SyncPiiConfigResponse {
  success: boolean;
  etags: Record<string, string>;
}

export interface PiiConfigValidationResult {
  consistent: boolean;
  unified_config: { count: number; entities: string[] };
  pii_conf: { count: number; entities: string[] };
  discrepancies: null | { in_unified_only: string[]; in_pii_conf_only: string[] };
  presidio_only_entities?: string[];
}

export async function syncPiiConfig(payload: SyncPiiConfigPayload): Promise<SyncPiiConfigResponse> {
  const r = await authenticatedFetch(`${API}/pii-detection/save-config`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (r.status === 412) {
    const data = await r.json();
    const err = new Error("PII configuration out of date");
    (err as any).conflict = data;
    throw err;
  }

  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function validatePiiConfig(): Promise<PiiConfigValidationResult> {
  const r = await authenticatedFetch(`${API}/pii-detection/validate-config`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ============================================================================
// QUALITY REPORTING API (FP & TP)
// ============================================================================

export interface QualityReportPayload {
  event_id: string;
  report_type: 'FP' | 'TP';  // False Positive or True Positive
  reason: string;
  comment: string;
}

export interface QualityReportResponse {
  success: boolean;
  report_id: string;
  message: string;
}

export async function submitQualityReport(payload: QualityReportPayload): Promise<QualityReportResponse> {
  const r = await authenticatedFetch(`${API}/feedback/submit`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(errorText || 'Failed to submit quality report');
  }

  return r.json();
}
