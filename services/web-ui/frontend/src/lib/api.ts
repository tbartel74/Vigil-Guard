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

export async function fetchPromptList(timeRange: string) {
  const r = await authenticatedFetch(`${API}/prompts/list?timeRange=${encodeURIComponent(timeRange)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchPromptDetails(id: string) {
  const r = await authenticatedFetch(`${API}/prompts/${encodeURIComponent(id)}`);
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
