import { createClient, ClickHouseClient } from '@clickhouse/client';

let clickhouseClient: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (!clickhouseClient) {
    const host = process.env.CLICKHOUSE_HOST || 'vigil-clickhouse';
    const port = process.env.CLICKHOUSE_PORT ? parseInt(process.env.CLICKHOUSE_PORT) : 8123;
    const database = process.env.CLICKHOUSE_DATABASE || 'n8n_logs';
    const username = process.env.CLICKHOUSE_USER || 'admin';
    // trufflehog:ignore - Default ClickHouse password for local development
    const password = process.env.CLICKHOUSE_PASSWORD || '';

    clickhouseClient = createClient({
      host: `http://${host}:${port}`,
      database,
      username,
      password,
    });

    console.log(`ClickHouse client initialized: ${host}:${port}/${database}`);
  }

  return clickhouseClient;
}

export interface QuickStats {
  requests_processed: number;
  threats_blocked: number;
  content_sanitized: number;
}

export async function getQuickStats(timeRange: string = '24 HOUR'): Promise<QuickStats> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        count() AS requests_processed,
        countIf(final_status = 'BLOCKED') AS threats_blocked,
        countIf(final_status = 'SANITIZED') AS content_sanitized
      FROM n8n_logs.events_processed
      WHERE timestamp >= now() - INTERVAL ${timeRange}
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<QuickStats>();

    if (data.length > 0) {
      return data[0];
    }

    // Return zeros if no data
    return {
      requests_processed: 0,
      threats_blocked: 0,
      content_sanitized: 0,
    };
  } catch (error) {
    console.error('ClickHouse query error:', error);
    // Return zeros on error
    return {
      requests_processed: 0,
      threats_blocked: 0,
      content_sanitized: 0,
    };
  }
}

// Keep old function name for backward compatibility (will be deprecated)
export async function getQuickStats24h(): Promise<QuickStats> {
  return getQuickStats('24 HOUR');
}

export interface PromptDetails {
  id: string;
  timestamp: string;
  input_raw: string;
  output_final: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  final_action: string;
  /** Prompt Guard score as percentage (0-100 range). Note: ClickHouse stores this in basis points (0-10000). */
  pg_score_percent: number;
  sanitizer_score: number;
  main_criteria: string;
  match_details: Array<{category: string; score: number}>;
}

export interface PromptListItem {
  id: string;
  timestamp: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  preview: string; // First 100 chars
}

/**
 * Get list of prompts within time range for dropdown selector
 */
export async function getPromptList(timeRange: string): Promise<PromptListItem[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        concat(sessionId, '-', toString(toUnixTimestamp64Milli(ts))) AS id,
        concat(formatDateTime(ts, '%Y-%m-%dT%H:%i:%S'), 'Z') AS timestamp,
        final_status,
        substring(JSONExtractString(pipeline_flow_json, 'input_raw'), 1, 100) AS preview
      FROM (
        SELECT
          sessionId,
          timestamp AS ts,
          final_status,
          pipeline_flow_json
        FROM n8n_logs.events_processed
        WHERE timestamp >= now() - INTERVAL ${timeRange}
        ORDER BY timestamp DESC
        LIMIT 100
      )
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<PromptListItem>();
    return data;
  } catch (error) {
    console.error('ClickHouse query error (getPromptList):', error);
    return [];
  }
}

/**
 * Get detailed information about specific prompt
 */
export async function getPromptDetails(eventId: string): Promise<PromptDetails | null> {
  const client = getClickHouseClient();

  try {
    // Parse the composite ID: sessionId-timestamp
    const parts = eventId.split('-');
    if (parts.length < 2) {
      return null;
    }
    const timestampMs = parts[parts.length - 1];
    const sessionId = parts.slice(0, -1).join('-');

    const query = `
      SELECT
        concat(sessionId, '-', toString(toUnixTimestamp64Milli(ts))) AS id,
        concat(formatDateTime(ts, '%Y-%m-%dT%H:%i:%S'), 'Z') AS timestamp,
        input_raw,
        output_final,
        final_status,
        final_action,
        pg_score_percent,
        sanitizer_score,
        main_criteria
      FROM (
        SELECT
          sessionId,
          timestamp AS ts,
          JSONExtractString(pipeline_flow_json, 'input_raw') AS input_raw,
          JSONExtractString(pipeline_flow_json, 'output_final') AS output_final,
          final_status,
          final_action,
          -- Workflow stores pg_score_percent as integer (0-10000 representing 0.00-100.00%)
          -- Normalize to percentage format (0-100) for UI display
          toFloat64(pg_score_percent / 100) AS pg_score_percent,
          toFloat64(ifNull(JSONExtract(scoring_json, 'sanitizer_score', 'Int32'), 0)) AS sanitizer_score,
          arrayStringConcat(
            arraySlice(
              arrayMap(
                x -> x.1,
                arraySort(
                  x -> -x.2,
                  arrayMap(
                    d -> (
                      JSONExtractString(d, 'category'),
                      toInt32(ifNull(JSONExtract(d, 'score', 'Int32'), 0))
                    ),
                    JSONExtractArrayRaw(scoring_json, 'match_details')
                  )
                )
              ),
              1, 3
            ),
            ' + '
          ) AS main_criteria
        FROM n8n_logs.events_processed
        WHERE sessionId = {sessionId:String}
          AND toUnixTimestamp64Milli(timestamp) = {timestampMs:Int64}
        LIMIT 1
      )
    `;

    const resultSet = await client.query({
      query,
      query_params: {
        sessionId,
        timestampMs: parseInt(timestampMs, 10),
      },
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<PromptDetails>();

    if (data.length > 0) {
      return data[0];
    }

    return null;
  } catch (error) {
    console.error('ClickHouse query error (getPromptDetails):', error);
    return null;
  }
}

export interface FalsePositiveReport {
  event_id: string;
  reported_by: string;
  report_type?: 'FP' | 'TP';  // Default: 'FP'
  reason: string;
  comment: string;
  event_timestamp?: string;
  original_input?: string;
  final_status?: string;
  threat_score?: number;
}

/**
 * Submit a false positive or true positive report
 */
export async function submitFalsePositiveReport(report: FalsePositiveReport): Promise<boolean> {
  const client = getClickHouseClient();

  try {
    // Prepare report data with timestamp conversion and default report_type
    const reportData = {
      ...report,
      report_type: report.report_type || 'FP',  // Default to 'FP' if not specified
      // Convert ISO8601 timestamp to ClickHouse-compatible format
      event_timestamp: report.event_timestamp
        ? report.event_timestamp.replace('T', ' ').replace('Z', '').substring(0, 23)
        : undefined
    };

    // Insert the report
    await client.insert({
      table: 'n8n_logs.false_positive_reports',
      values: [reportData],
      format: 'JSONEachRow',
    });

    const reportType = reportData.report_type === 'TP' ? 'TP' : 'FP';
    console.log(`${reportType} report submitted: event=${report.event_id}, by=${report.reported_by}, reason=${report.reason}`);
    return true;
  } catch (error) {
    console.error('ClickHouse insert error (quality report):', error);
    return false;
  }
}

export interface FPStats {
  total_reports: number;
  unique_events: number;
  top_reason: string;
  last_7_days: number;
}

/**
 * Get false positive statistics
 */
export async function getFPStats(): Promise<FPStats> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        count() AS total_reports,
        uniq(event_id) AS unique_events,
        any(reason) AS top_reason,
        countIf(timestamp >= now() - INTERVAL 7 DAY) AS last_7_days
      FROM n8n_logs.false_positive_reports
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<FPStats>();

    if (data.length > 0) {
      return data[0];
    }

    return {
      total_reports: 0,
      unique_events: 0,
      top_reason: 'N/A',
      last_7_days: 0,
    };
  } catch (error) {
    console.error('ClickHouse query error (FP stats):', error);
    return {
      total_reports: 0,
      unique_events: 0,
      top_reason: 'N/A',
      last_7_days: 0,
    };
  }
}

// ============================================================================
// FALSE POSITIVE DETAILED REPORTING
// ============================================================================

/**
 * FP Report List Parameters
 */
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

/**
 * Detailed FP Report (with event context from JOIN)
 */
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
}

/**
 * FP Report List Response (with pagination)
 */
export interface FPReportListResponse {
  rows: FPReportDetailed[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/**
 * Get paginated, filterable list of FP reports with event context
 */
export async function getFPReportList(params: FPReportListParams): Promise<FPReportListResponse> {
  const client = getClickHouseClient();

  try {
    // Build WHERE conditions
    const whereConditions: string[] = ['1=1'];
    const queryParams: any = {
      pageSize: params.pageSize,
      offset: (params.page - 1) * params.pageSize,
    };

    if (params.startDate) {
      whereConditions.push("fp.timestamp >= {startDate:DateTime64(3, 'UTC')}");
      queryParams.startDate = params.startDate;
    }

    if (params.endDate) {
      whereConditions.push("fp.timestamp <= {endDate:DateTime64(3, 'UTC')}");
      queryParams.endDate = params.endDate;
    }

    if (params.reason) {
      whereConditions.push('fp.reason = {reason:String}');
      queryParams.reason = params.reason;
    }

    if (params.reportedBy) {
      whereConditions.push('fp.reported_by = {reportedBy:String}');
      queryParams.reportedBy = params.reportedBy;
    }

    if (params.reportType && params.reportType !== 'ALL') {
      whereConditions.push('fp.report_type = {reportType:String}');
      queryParams.reportType = params.reportType;
    }

    if (params.minScore !== undefined) {
      whereConditions.push('fp.threat_score >= {minScore:Float64}');
      queryParams.minScore = params.minScore;
    }

    if (params.maxScore !== undefined) {
      whereConditions.push('fp.threat_score <= {maxScore:Float64}');
      queryParams.maxScore = params.maxScore;
    }

    // Validate and sanitize sort column
    const allowedSortColumns = ['report_timestamp', 'event_timestamp', 'threat_score'];
    const sortBy = allowedSortColumns.includes(params.sortBy || '')
      ? params.sortBy
      : 'report_timestamp';
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    // Map friendly names to actual columns
    const columnMapping: Record<string, string> = {
      report_timestamp: 'fp.timestamp',
      event_timestamp: 'fp.event_timestamp',
      threat_score: 'fp.threat_score',
    };

    const safeSortColumn = columnMapping[sortBy!];

    // Count total matching records
    const countQuery = `
      SELECT count() AS total
      FROM n8n_logs.false_positive_reports AS fp
      WHERE ${whereConditions.join(' AND ')}
    `;

    const countResult = await client.query({
      query: countQuery,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const countData = await countResult.json<{ total: number }>();
    const total = countData[0]?.total || 0;

    // Fetch paginated results with JOIN to events_processed
    const dataQuery = `
      SELECT
        fp.report_id,
        fp.event_id,
        fp.reported_by,
        fp.report_type,
        fp.reason,
        fp.comment,
        formatDateTime(fp.timestamp, '%Y-%m-%dT%H:%i:%SZ') AS report_timestamp,
        formatDateTime(fp.event_timestamp, '%Y-%m-%dT%H:%i:%SZ') AS event_timestamp,
        fp.original_input,
        fp.final_status,
        fp.threat_score,

        -- Extract detected categories from scoring_json
        arrayDistinct(
          arrayFilter(x -> x != '',
            arrayMap(x -> JSONExtractString(x, 'category'),
                     JSONExtractArrayRaw(ifNull(ep.scoring_json, '[]')))
          )
        ) AS detected_categories,

        -- Extract sanitizer score
        toUInt8(ifNull(JSONExtractInt(ep.scoring_json, 'sanitizer_score'), 0)) AS sanitizer_score,

        -- Extract Prompt Guard score
        toFloat64(ifNull(ep.pg_score_percent, 0)) AS pg_score_percent,

        -- Extract decision reason (internal_note from final_decision_json)
        ifNull(JSONExtractString(ep.final_decision_json, 'internal_note'), '') AS decision_reason

      FROM n8n_logs.false_positive_reports AS fp
      LEFT JOIN n8n_logs.events_processed AS ep
        ON fp.event_id = ep.event_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${safeSortColumn} ${sortOrder}
      LIMIT {pageSize:UInt16} OFFSET {offset:UInt32}
    `;

    const dataResult = await client.query({
      query: dataQuery,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await dataResult.json<FPReportDetailed>();

    return {
      rows,
      total,
      page: params.page,
      pageSize: params.pageSize,
      pages: Math.ceil(total / params.pageSize),
    };
  } catch (error) {
    console.error('ClickHouse query error (FP report list):', error);
    return {
      rows: [],
      total: 0,
      page: params.page,
      pageSize: params.pageSize,
      pages: 0,
    };
  }
}

/**
 * FP Statistics by Reason
 */
export interface FPReasonStats {
  reason: string;
  count: number;
  percentage: number;
  avg_threat_score: number;
}

/**
 * Get FP statistics grouped by reason
 */
export async function getFPStatsByReason(timeRange: string = '30 DAY'): Promise<FPReasonStats[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        reason,
        count() AS count,
        round(count() * 100.0 / sum(count()) OVER (), 2) AS percentage,
        round(avg(threat_score), 2) AS avg_threat_score
      FROM n8n_logs.false_positive_reports
      WHERE timestamp >= now() - INTERVAL ${timeRange}
      GROUP BY reason
      ORDER BY count DESC
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    return await resultSet.json<FPReasonStats>();
  } catch (error) {
    console.error('ClickHouse query error (FP stats by reason):', error);
    return [];
  }
}

/**
 * FP Statistics by Reporter
 */
export interface FPReporterStats {
  reported_by: string;
  count: number;
  recent_reports: number;
}

/**
 * Get FP statistics grouped by reporter
 */
export async function getFPStatsByReporter(timeRange: string = '30 DAY'): Promise<FPReporterStats[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        reported_by,
        count() AS count,
        countIf(timestamp >= now() - INTERVAL 7 DAY) AS recent_reports
      FROM n8n_logs.false_positive_reports
      WHERE timestamp >= now() - INTERVAL ${timeRange}
      GROUP BY reported_by
      ORDER BY count DESC
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    return await resultSet.json<FPReporterStats>();
  } catch (error) {
    console.error('ClickHouse query error (FP stats by reporter):', error);
    return [];
  }
}

/**
 * FP Statistics by Detected Category
 */
export interface FPCategoryStats {
  category: string;
  count: number;
  percentage: number;
}

/**
 * Get FP statistics grouped by final_status
 * Uses data from false_positive_reports table directly (no JOIN needed)
 * Shows breakdown: ALLOWED, SANITIZED, BLOCKED
 */
export async function getFPStatsByCategory(timeRange: string = '30 DAY'): Promise<FPCategoryStats[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        final_status AS category,
        count() AS count,
        round(count() * 100.0 / sum(count()) OVER (), 2) AS percentage
      FROM n8n_logs.false_positive_reports
      WHERE timestamp >= now() - INTERVAL ${timeRange}
      GROUP BY final_status
      ORDER BY count DESC
      LIMIT 20
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    return await resultSet.json<FPCategoryStats>();
  } catch (error) {
    console.error('ClickHouse query error (FP stats by category):', error);
    return [];
  }
}

/**
 * FP Trend Data
 */
export interface FPTrendData {
  date: string;
  count: number;
}

/**
 * Get FP trend over time (daily or weekly)
 */
export async function getFPTrend(timeRange: string = '30 DAY', interval: 'day' | 'week' = 'day'): Promise<FPTrendData[]> {
  const client = getClickHouseClient();

  try {
    const dateFunc = interval === 'week' ? 'toStartOfWeek' : 'toDate';
    const dateFormat = interval === 'week' ? '%Y-W%V' : '%Y-%m-%d';

    const query = `
      SELECT
        formatDateTime(${dateFunc}(timestamp), '${dateFormat}') AS date,
        count() AS count
      FROM n8n_logs.false_positive_reports
      WHERE timestamp >= now() - INTERVAL ${timeRange}
      GROUP BY ${dateFunc}(timestamp)
      ORDER BY ${dateFunc}(timestamp) ASC
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    return await resultSet.json<FPTrendData>();
  } catch (error) {
    console.error('ClickHouse query error (FP trend):', error);
    return [];
  }
}

/**
 * Get single FP report with full event context including decision analysis
 */
export async function getFPReportDetails(reportId: string): Promise<FPReportDetailed & {
  scoring_breakdown: any;
  sanitizer_breakdown: any;
  final_decision: any;
  pattern_matches: any[];
  pipeline_flow: any;
  final_action: string;
  removal_pct: number;
  processing_time_ms: number;
  pii_sanitized: number;
  pii_types_detected: string[];
  pii_entities_count: number;
  detected_language: string;
  decision_source: string;
} | null> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        fp.report_id,
        fp.event_id,
        fp.reported_by,
        fp.report_type,
        fp.reason,
        fp.comment,
        formatDateTime(fp.timestamp, '%Y-%m-%dT%H:%i:%SZ') AS report_timestamp,
        formatDateTime(fp.event_timestamp, '%Y-%m-%dT%H:%i:%SZ') AS event_timestamp,
        fp.original_input,
        fp.final_status,
        fp.threat_score,

        -- NEW: Additional metadata for decision analysis
        ifNull(ep.final_action, '') AS final_action,
        toFloat64(ifNull(ep.removal_pct, 0)) AS removal_pct,
        toUInt32(ifNull(ep.processing_time_ms, 0)) AS processing_time_ms,
        toUInt8(ifNull(ep.pii_sanitized, 0)) AS pii_sanitized,
        ifNull(ep.pii_types_detected, []) AS pii_types_detected,
        toUInt32(ifNull(ep.pii_entities_count, 0)) AS pii_entities_count,
        ifNull(ep.detected_language, '') AS detected_language,

        -- Detected categories
        arrayDistinct(
          arrayFilter(x -> x != '',
            arrayMap(x -> JSONExtractString(x, 'category'),
                     JSONExtractArrayRaw(ifNull(ep.scoring_json, '[]')))
          )
        ) AS detected_categories,

        -- Scores
        toUInt8(ifNull(JSONExtractInt(ep.scoring_json, 'sanitizer_score'), 0)) AS sanitizer_score,
        toFloat64(ifNull(ep.pg_score_percent, 0)) AS pg_score_percent,

        -- Decision source and reason
        ifNull(JSONExtractString(ep.final_decision_json, 'source'), 'unknown') AS decision_source,
        ifNull(JSONExtractString(ep.final_decision_json, 'internal_note'), '') AS decision_reason,

        -- Full context (JSON fields for detailed analysis)
        ep.scoring_json AS scoring_breakdown,
        ep.sanitizer_json AS sanitizer_breakdown,
        ep.final_decision_json AS final_decision,
        ep.pipeline_flow_json AS pipeline_flow

      FROM n8n_logs.false_positive_reports AS fp
      LEFT JOIN n8n_logs.events_processed AS ep
        ON fp.event_id = ep.event_id
      WHERE fp.report_id = {reportId:String}
      LIMIT 1
    `;

    const resultSet = await client.query({
      query,
      query_params: { reportId },
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<any>();

    if (data.length === 0) {
      return null;
    }

    const row = data[0];

    // Parse JSON fields
    return {
      ...row,
      scoring_breakdown: row.scoring_breakdown ? JSON.parse(row.scoring_breakdown) : null,
      sanitizer_breakdown: row.sanitizer_breakdown ? JSON.parse(row.sanitizer_breakdown) : null,
      final_decision: row.final_decision ? JSON.parse(row.final_decision) : null,
      pattern_matches: row.scoring_breakdown
        ? JSON.parse(row.scoring_breakdown).match_details || []
        : [],
      pipeline_flow: row.pipeline_flow ? JSON.parse(row.pipeline_flow) : null,
    };
  } catch (error) {
    console.error('ClickHouse query error (FP report details):', error);
    return null;
  }
}

// ============================================================================
// INVESTIGATION - ADVANCED PROMPT SEARCH
// ============================================================================

export interface SearchParams {
  startDate?: string;       // ISO 8601: "2025-10-19T00:00:00Z"
  endDate?: string;         // ISO 8601: "2025-10-20T23:59:59Z"
  textQuery?: string;       // Full-text search: "ignore all"
  clientId?: string;        // NEW v1.7.0: Filter by browser client ID
  status?: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  minScore?: number;        // 0-100
  maxScore?: number;        // 0-100
  categories?: string[];    // ["SQL_INJECTION", "JAILBREAK_ATTEMPT"]
  sortBy?: 'timestamp' | 'threat_score' | 'final_status';
  sortOrder?: 'ASC' | 'DESC';
  page: number;             // 1-indexed
  pageSize: number;         // 25, 50, 100
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
  // NEW v1.7.0: Browser metadata for detail view
  browser_name?: string;
  browser_version?: string;
  browser_language?: string;
  browser_timezone?: string;
  os_name?: string;
}

export interface SearchResult {
  rows: SearchResultRow[];
  total: number;
}

/**
 * Advanced prompt search with multiple filters
 */
export async function searchPrompts(params: SearchParams): Promise<SearchResult> {
  const client = getClickHouseClient();

  try {
    const whereConditions: string[] = [];
    const queryParams: Record<string, any> = {};

    // Date range filter
    if (params.startDate) {
      whereConditions.push('timestamp >= {startDate:DateTime}');
      queryParams.startDate = params.startDate.replace('T', ' ').replace('Z', '');
    }
    if (params.endDate) {
      whereConditions.push('timestamp <= {endDate:DateTime}');
      queryParams.endDate = params.endDate.replace('T', ' ').replace('Z', '');
    }

    // Text search (full-text with case-insensitive in ORIGINAL input - before sanitization)
    if (params.textQuery && params.textQuery.trim() !== '') {
      whereConditions.push('positionCaseInsensitive(original_input, {textQuery:String}) > 0');
      queryParams.textQuery = params.textQuery.trim();
    }

    // NEW v1.7.0: Client ID filter (exact match)
    if (params.clientId && params.clientId.trim() !== '') {
      whereConditions.push('client_id = {clientId:String}');
      queryParams.clientId = params.clientId.trim();
    }

    // Status filter
    if (params.status) {
      whereConditions.push('final_status = {status:String}');
      queryParams.status = params.status;
    }

    // Threat score range
    if (params.minScore !== undefined && params.minScore !== null) {
      whereConditions.push('threat_score >= {minScore:UInt8}');
      queryParams.minScore = params.minScore;
    }
    if (params.maxScore !== undefined && params.maxScore !== null) {
      whereConditions.push('threat_score <= {maxScore:UInt8}');
      queryParams.maxScore = params.maxScore;
    }

    // Detection categories filter (if any category matches)
    if (params.categories && params.categories.length > 0) {
      whereConditions.push(`
        hasAny(
          arrayMap(x -> JSONExtractString(x, 'category'),
                   JSONExtractArrayRaw(scoring_json, 'match_details')),
          {categories:Array(String)}
        )
      `);
      queryParams.categories = params.categories;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Count total matching records
    const countQuery = `
      SELECT count() as total
      FROM n8n_logs.events_processed
      ${whereClause}
    `;

    const totalResult = await client.query({
      query: countQuery,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const totalData = await totalResult.json<{total: string}>();
    const total = totalData.length > 0 ? Number(totalData[0].total) : 0;

    // Fetch paginated results
    const offset = (params.page - 1) * params.pageSize;
    const sortBy = params.sortBy || 'timestamp';
    const sortOrder = params.sortOrder || 'DESC';

    // Validate sort column to prevent SQL injection
    const allowedSortColumns = ['timestamp', 'threat_score', 'final_status'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'timestamp';

    const dataQuery = `
      SELECT
        event_id,
        formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS timestamp,
        client_id,
        original_input AS prompt_input,
        final_status,
        toUInt8(ifNull(JSONExtract(scoring_json, 'sanitizer_score', 'Int32'), 0)) AS threat_score,
        arrayDistinct(
          arrayMap(x -> JSONExtractString(x, 'category'),
                   JSONExtractArrayRaw(scoring_json, 'match_details'))
        ) AS detected_categories,
        toString(pipeline_flow_json) AS pipeline_flow,
        toString(scoring_json) AS scoring,
        toString(prompt_guard_json) AS prompt_guard,
        toString(final_decision_json) AS final_decision,
        toString(sanitizer_json) AS sanitizer,
        browser_name,
        browser_version,
        browser_language,
        browser_timezone,
        os_name
      FROM n8n_logs.events_processed
      ${whereClause}
      ORDER BY ${safeSortBy} ${sortOrder}
      LIMIT {pageSize:UInt16} OFFSET {offset:UInt32}
    `;

    const dataResult = await client.query({
      query: dataQuery,
      query_params: {
        ...queryParams,
        pageSize: params.pageSize,
        offset: offset,
      },
      format: 'JSONEachRow',
    });

    const rows = await dataResult.json<SearchResultRow>();

    return {
      rows,
      total,
    };
  } catch (error) {
    console.error('ClickHouse query error (searchPrompts):', error);
    throw error;
  }
}

// ============================================================================
// PII STATISTICS (v1.7.0)
// ============================================================================

export interface PIITypeStats {
  type: string;
  count: number;
  percentage: number;
}

export interface PIIOverview {
  total_requests: number;
  requests_with_pii: number;
  pii_detection_rate: number;
  total_pii_entities: number;
  top_pii_types: PIITypeStats[];
}

/**
 * Get PII entity type distribution (Top 10 PII types detected)
 * NOTE: Requires ClickHouse schema v1.7.0 with pii_types_detected column
 */
export async function getPIITypeStats(timeRange: string = '24 HOUR'): Promise<PIITypeStats[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        pii_type,
        count() AS count,
        round(count() * 100.0 / sum(count()) OVER (), 2) AS percentage
      FROM (
        SELECT arrayJoin(pii_types_detected) AS pii_type
        FROM n8n_logs.events_processed
        WHERE timestamp >= now() - INTERVAL ${timeRange}
          AND pii_sanitized = 1
      )
      GROUP BY pii_type
      ORDER BY count DESC
      LIMIT 10
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<{pii_type: string; count: string; percentage: string}>();

    return data.map(row => ({
      type: row.pii_type,
      count: Number(row.count),
      percentage: Number(row.percentage),
    }));
  } catch (error) {
    console.error('ClickHouse query error (getPIITypeStats):', error);
    return [];
  }
}

/**
 * Get PII detection overview statistics
 * NOTE: Requires ClickHouse schema v1.7.0 with pii_sanitized and pii_entities_count columns
 */
export async function getPIIOverview(timeRange: string = '24 HOUR'): Promise<PIIOverview> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        count() AS total_requests,
        countIf(pii_sanitized = 1) AS requests_with_pii,
        round(countIf(pii_sanitized = 1) * 100.0 / count(), 2) AS pii_detection_rate,
        sum(pii_entities_count) AS total_pii_entities
      FROM n8n_logs.events_processed
      WHERE timestamp >= now() - INTERVAL ${timeRange}
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<{
      total_requests: string;
      requests_with_pii: string;
      pii_detection_rate: string;
      total_pii_entities: string;
    }>();

    // Get top PII types
    const topTypes = await getPIITypeStats(timeRange);

    if (data.length > 0) {
      return {
        total_requests: Number(data[0].total_requests),
        requests_with_pii: Number(data[0].requests_with_pii),
        pii_detection_rate: Number(data[0].pii_detection_rate),
        total_pii_entities: Number(data[0].total_pii_entities),
        top_pii_types: topTypes,
      };
    }

    return {
      total_requests: 0,
      requests_with_pii: 0,
      pii_detection_rate: 0,
      total_pii_entities: 0,
      top_pii_types: [],
    };
  } catch (error) {
    console.error('ClickHouse query error (getPIIOverview):', error);
    return {
      total_requests: 0,
      requests_with_pii: 0,
      pii_detection_rate: 0,
      total_pii_entities: 0,
      top_pii_types: [],
    };
  }
}

export async function closeClickHouseClient(): Promise<void> {
  if (clickhouseClient) {
    await clickhouseClient.close();
    clickhouseClient = null;
  }
}
