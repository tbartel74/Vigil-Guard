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
  reason: string;
  comment: string;
  event_timestamp?: string;
  original_input?: string;
  final_status?: string;
  threat_score?: number;
}

/**
 * Submit a false positive report
 */
export async function submitFalsePositiveReport(report: FalsePositiveReport): Promise<boolean> {
  const client = getClickHouseClient();

  try {
    // Prepare report data with timestamp conversion
    const reportData = {
      ...report,
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

    console.log(`FP report submitted: event=${report.event_id}, by=${report.reported_by}, reason=${report.reason}`);
    return true;
  } catch (error) {
    console.error('ClickHouse insert error (FP report):', error);
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
// INVESTIGATION - ADVANCED PROMPT SEARCH
// ============================================================================

export interface SearchParams {
  startDate?: string;       // ISO 8601: "2025-10-19T00:00:00Z"
  endDate?: string;         // ISO 8601: "2025-10-20T23:59:59Z"
  textQuery?: string;       // Full-text search: "ignore all"
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
  prompt_input: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  threat_score: number;
  detected_categories: string[];
  pipeline_flow: string;    // JSON: input_raw, normalized, sanitized, final output
  scoring: string;          // JSON: score_breakdown, match_details with patterns
  prompt_guard: string;     // JSON: PG score, risk_level, confidence
  final_decision: string;   // JSON: action_taken, internal_note, source
  sanitizer: string;        // JSON: decision, breakdown, removal_pct
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
        toString(sanitizer_json) AS sanitizer
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

export async function closeClickHouseClient(): Promise<void> {
  if (clickhouseClient) {
    await clickhouseClient.close();
    clickhouseClient = null;
  }
}
