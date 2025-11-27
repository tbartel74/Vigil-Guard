/**
 * ClickHouse v2 Module - Events V2 with 3-Branch Detection Architecture
 *
 * This module handles queries for the new events_v2 table that supports:
 * - 3 branch scores (heuristics, semantic, llm_guard/NLP analysis)
 * - Arbiter decision fields (threat_score, confidence, boosts_applied)
 * - PII detection with detailed tracking
 */

import { getClickHouseClient } from './clickhouse.js';

// ============================================================================
// INTERFACES FOR EVENTS_V2
// ============================================================================

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

export interface EventV2ListItem {
  id: string;  // UUID from events_v2
  timestamp: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  final_decision: 'ALLOW' | 'BLOCK';
  threat_score: number;
  branch_a_score: number;
  branch_b_score: number;
  branch_c_score: number;
  confidence: number;
  boosts_applied: string[];
  pii_sanitized: boolean;
  pii_types_detected: string[];
  pii_entities_count: number;
  original_input: string;
  result: string;  // v2.0.0: output after sanitization
  client_id: string;  // v2.0.0: browser fingerprint from plugin
  browser_name: string;  // v2.0.0: Chrome, Firefox, etc.
  browser_version: string;  // v2.0.0: browser version
  os_name: string;  // v2.0.0: Windows, macOS, Linux, etc.
  preview: string;
}

export interface EventV2Details {
  id: string;  // UUID from events_v2
  sessionId: string;
  timestamp: string;

  // Input/Output
  original_input: string;
  chat_input: string;
  result: string;
  detected_language: string;

  // 3-Branch Scores
  branch_a_score: number;
  branch_b_score: number;
  branch_c_score: number;

  // Arbiter Decision
  threat_score: number;
  confidence: number;
  boosts_applied: string[];

  // Final Decision
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  final_decision: 'ALLOW' | 'BLOCK';

  // PII Detection
  pii_sanitized: boolean;
  pii_types_detected: string[];
  pii_entities_count: number;

  // Client Metadata
  client_id: string;
  browser_name: string;
  browser_version: string;
  os_name: string;

  // Pipeline Metadata
  pipeline_version: string;
  config_version: string;

  // JSON Fields (parsed)
  arbiter_json: any;
  branch_results_json: any;
  pii_classification_json: any;
}

export interface SearchParamsV2 {
  startDate?: string;
  endDate?: string;
  textQuery?: string;
  clientId?: string;
  status?: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  minScore?: number;
  maxScore?: number;
  piiOnly?: boolean;
  sortBy?: 'timestamp' | 'threat_score' | 'final_status' | 'branch_a_score' | 'branch_b_score' | 'branch_c_score';
  sortOrder?: 'ASC' | 'DESC';
  page: number;
  pageSize: number;
}

export interface SearchResultV2 {
  rows: EventV2ListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

// ============================================================================
// QUICK STATS FOR EVENTS_V2
// ============================================================================

/**
 * Get quick stats from events_v2 table (v2.0.0+)
 */
export async function getQuickStatsV2(timeRange: string = '24 HOUR'): Promise<QuickStatsV2> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        count() AS requests_processed,
        countIf(final_status = 'BLOCKED') AS threats_blocked,
        countIf(final_status = 'SANITIZED') AS content_sanitized,
        countIf(pii_sanitized = 1) AS pii_sanitized
      FROM n8n_logs.events_v2
      WHERE timestamp >= now() - INTERVAL ${timeRange}
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<QuickStatsV2>();

    if (data.length > 0) {
      return data[0];
    }

    return {
      requests_processed: 0,
      threats_blocked: 0,
      content_sanitized: 0,
      pii_sanitized: 0,
    };
  } catch (error) {
    console.error('ClickHouse query error (getQuickStatsV2):', error);
    return {
      requests_processed: 0,
      threats_blocked: 0,
      content_sanitized: 0,
      pii_sanitized: 0,
    };
  }
}

/**
 * Get 3-branch average scores
 */
export async function getBranchStats(timeRange: string = '24 HOUR'): Promise<BranchStats> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        round(avg(branch_a_score), 2) AS branch_a_avg,
        round(avg(branch_b_score), 2) AS branch_b_avg,
        round(avg(branch_c_score), 2) AS branch_c_avg,
        round(avg(threat_score), 2) AS threat_score_avg,
        round(avg(confidence), 4) AS confidence_avg
      FROM n8n_logs.events_v2
      WHERE timestamp >= now() - INTERVAL ${timeRange}
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<BranchStats>();

    if (data.length > 0) {
      return data[0];
    }

    return {
      branch_a_avg: 0,
      branch_b_avg: 0,
      branch_c_avg: 0,
      threat_score_avg: 0,
      confidence_avg: 0,
    };
  } catch (error) {
    console.error('ClickHouse query error (getBranchStats):', error);
    return {
      branch_a_avg: 0,
      branch_b_avg: 0,
      branch_c_avg: 0,
      threat_score_avg: 0,
      confidence_avg: 0,
    };
  }
}

// ============================================================================
// EVENT LIST AND SEARCH
// ============================================================================

/**
 * Get list of events from events_v2 for dropdown/table display
 */
export async function getEventListV2(timeRange: string, limit: number = 100): Promise<EventV2ListItem[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        toString(id) AS id,
        formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS ts_iso,
        final_status,
        final_decision,
        threat_score,
        branch_a_score,
        branch_b_score,
        branch_c_score,
        pii_sanitized,
        substring(original_input, 1, 100) AS preview
      FROM n8n_logs.events_v2
      WHERE timestamp >= now() - INTERVAL ${timeRange}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<any>();

    // Map ts_iso → timestamp to avoid alias/type conflicts in ClickHouse
    return data.map((row: any) => ({
      ...row,
      timestamp: row.ts_iso,
      pii_sanitized: row.pii_sanitized === 1,
    }));
  } catch (error) {
    console.error('ClickHouse query error (getEventListV2):', error);
    return [];
  }
}

/**
 * Search events_v2 with filters
 */
export async function searchEventsV2(params: SearchParamsV2): Promise<SearchResultV2> {
  const client = getClickHouseClient();

  try {
    const whereConditions: string[] = ['1=1'];
    const queryParams: Record<string, any> = {
      pageSize: params.pageSize,
      offset: (params.page - 1) * params.pageSize,
    };

    if (params.startDate) {
      whereConditions.push("timestamp >= {startDate:DateTime64(3, 'UTC')}");
      queryParams.startDate = params.startDate;
    }

    if (params.endDate) {
      whereConditions.push("timestamp <= {endDate:DateTime64(3, 'UTC')}");
      queryParams.endDate = params.endDate;
    }

    if (params.textQuery && params.textQuery.trim() !== '') {
      whereConditions.push('positionCaseInsensitive(original_input, {textQuery:String}) > 0');
      queryParams.textQuery = params.textQuery.trim();
    }

    if (params.clientId && params.clientId.trim() !== '') {
      whereConditions.push('client_id = {clientId:String}');
      queryParams.clientId = params.clientId.trim();
    }

    if (params.status) {
      whereConditions.push('final_status = {status:String}');
      queryParams.status = params.status;
    }

    if (params.minScore !== undefined) {
      whereConditions.push('threat_score >= {minScore:UInt8}');
      queryParams.minScore = params.minScore;
    }

    if (params.maxScore !== undefined) {
      whereConditions.push('threat_score <= {maxScore:UInt8}');
      queryParams.maxScore = params.maxScore;
    }

    if (params.piiOnly) {
      whereConditions.push('pii_sanitized = 1');
    }

    const allowedSortColumns = ['timestamp', 'threat_score', 'final_status', 'branch_a_score', 'branch_b_score', 'branch_c_score'];
    const sortBy = allowedSortColumns.includes(params.sortBy || '') ? params.sortBy : 'timestamp';
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const whereClause = whereConditions.join(' AND ');

    // Count total
    const countQuery = `
      SELECT count() AS total
      FROM n8n_logs.events_v2
      WHERE ${whereClause}
    `;

    const countResult = await client.query({
      query: countQuery,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const countData = await countResult.json<{ total: number }>();
    const total = countData[0]?.total || 0;

    // Fetch data
    const dataQuery = `
      SELECT
        toString(id) AS id,
        formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS ts_iso,
        final_status,
        final_decision,
        threat_score,
        branch_a_score,
        branch_b_score,
        branch_c_score,
        confidence,
        boosts_applied,
        pii_sanitized,
        pii_types_detected,
        pii_entities_count,
        detected_language,
        original_input,
        result,
        client_id,
        browser_name,
        browser_version,
        os_name,
        substring(original_input, 1, 100) AS preview,
        pii_classification_json
      FROM n8n_logs.events_v2
      WHERE ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT {pageSize:UInt16} OFFSET {offset:UInt32}
    `;

    const dataResult = await client.query({
      query: dataQuery,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await dataResult.json<any>();

    return {
      rows: rows.map((row: any) => ({
        ...row,
        timestamp: row.ts_iso,
        pii_sanitized: row.pii_sanitized === 1,
        pii_classification_json: row.pii_classification_json ? JSON.parse(row.pii_classification_json) : null,
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
      pages: Math.ceil(total / params.pageSize),
    };
  } catch (error) {
    console.error('ClickHouse query error (searchEventsV2):', error);
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
 * Get detailed event information by event_id
 */
export async function getEventDetailsV2(eventId: string): Promise<EventV2Details | null> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        toString(id) AS id,
        sessionId,
        formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS timestamp,
        original_input,
        chat_input,
        result,
        detected_language,
        branch_a_score,
        branch_b_score,
        branch_c_score,
        threat_score,
        confidence,
        boosts_applied,
        final_status,
        final_decision,
        pii_sanitized,
        pii_types_detected,
        pii_entities_count,
        client_id,
        browser_name,
        browser_version,
        os_name,
        pipeline_version,
        config_version,
        arbiter_json,
        branch_results_json,
        pii_classification_json
      FROM n8n_logs.events_v2
      WHERE toString(id) = {eventId:String}
      LIMIT 1
    `;

    const resultSet = await client.query({
      query,
      query_params: { eventId },
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
      pii_sanitized: row.pii_sanitized === 1,
      arbiter_json: row.arbiter_json ? JSON.parse(row.arbiter_json) : null,
      branch_results_json: row.branch_results_json ? JSON.parse(row.branch_results_json) : null,
      pii_classification_json: row.pii_classification_json ? JSON.parse(row.pii_classification_json) : null,
    };
  } catch (error) {
    console.error('ClickHouse query error (getEventDetailsV2):', error);
    return null;
  }
}

// ============================================================================
// STATUS DISTRIBUTION FOR CHARTS
// ============================================================================

export interface StatusDistribution {
  status: string;
  count: number;
  percentage: number;
}

/**
 * Get status distribution for pie/bar charts
 */
export async function getStatusDistribution(timeRange: string = '24 HOUR'): Promise<StatusDistribution[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        final_status AS status,
        count() AS count,
        round(count() * 100.0 / sum(count()) OVER (), 2) AS percentage
      FROM n8n_logs.events_v2
      WHERE timestamp >= now() - INTERVAL ${timeRange}
      GROUP BY final_status
      ORDER BY count DESC
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    return await resultSet.json<StatusDistribution>();
  } catch (error) {
    console.error('ClickHouse query error (getStatusDistribution):', error);
    return [];
  }
}

// ============================================================================
// BOOSTS ANALYSIS
// ============================================================================

export interface BoostStats {
  boost: string;  // Changed from boost_name to match frontend contract
  count: number;
  percentage: number;
}

/**
 * Get analysis of which priority boosts are most commonly applied
 * @returns Array of boost stats or empty array on error (with logged error)
 */
export async function getBoostStats(timeRange: string = '24 HOUR'): Promise<BoostStats[]> {
  const client = getClickHouseClient();

  try {
    // Use NULLIF to prevent division by zero when no events exist in timeRange
    const query = `
      SELECT
        boost,
        count() AS count,
        COALESCE(
          round(count() * 100.0 / NULLIF((SELECT count() FROM n8n_logs.events_v2 WHERE timestamp >= now() - INTERVAL ${timeRange}), 0), 2),
          0
        ) AS percentage
      FROM (
        SELECT arrayJoin(boosts_applied) AS boost
        FROM n8n_logs.events_v2
        WHERE timestamp >= now() - INTERVAL ${timeRange}
          AND length(boosts_applied) > 0
      )
      GROUP BY boost
      ORDER BY count DESC
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    return await resultSet.json<BoostStats>();
  } catch (error) {
    console.error('ClickHouse query error (getBoostStats):', error);
    return [];
  }
}

// ============================================================================
// HOURLY TREND FOR CHARTS
// ============================================================================

export interface HourlyTrend {
  hour: string;
  total: number;
  blocked: number;
  sanitized: number;
  allowed: number;
}

/**
 * Get hourly trend for last 24 hours
 */
export async function getHourlyTrend(): Promise<HourlyTrend[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        formatDateTime(toStartOfHour(timestamp), '%Y-%m-%dT%H:00:00Z') AS hour,
        count() AS total,
        countIf(final_status = 'BLOCKED') AS blocked,
        countIf(final_status = 'SANITIZED') AS sanitized,
        countIf(final_status = 'ALLOWED') AS allowed
      FROM n8n_logs.events_v2
      WHERE timestamp >= now() - INTERVAL 24 HOUR
      GROUP BY toStartOfHour(timestamp)
      ORDER BY hour ASC
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    return await resultSet.json<HourlyTrend>();
  } catch (error) {
    console.error('ClickHouse query error (getHourlyTrend):', error);
    return [];
  }
}

// ============================================================================
// PII STATISTICS FOR V2
// ============================================================================

export interface PIIStatsV2 {
  total_with_pii: number;
  pii_detection_rate: number;
  total_entities: number;
  top_types: Array<{ type: string; count: number; percentage: number }>;
}

/**
 * Get PII statistics from events_v2
 */
export async function getPIIStatsV2(timeRange: string = '24 HOUR'): Promise<PIIStatsV2> {
  const client = getClickHouseClient();

  try {
    // Overview query
    const overviewQuery = `
      SELECT
        countIf(pii_sanitized = 1) AS total_with_pii,
        round(countIf(pii_sanitized = 1) * 100.0 / count(), 2) AS pii_detection_rate,
        sum(pii_entities_count) AS total_entities
      FROM n8n_logs.events_v2
      WHERE timestamp >= now() - INTERVAL ${timeRange}
    `;

    const overviewResult = await client.query({
      query: overviewQuery,
      format: 'JSONEachRow',
    });

    const overviewData = await overviewResult.json<any>();

    // Top types query
    const typesQuery = `
      SELECT
        pii_type AS type,
        count() AS count,
        round(count() * 100.0 / sum(count()) OVER (), 2) AS percentage
      FROM (
        SELECT arrayJoin(pii_types_detected) AS pii_type
        FROM n8n_logs.events_v2
        WHERE timestamp >= now() - INTERVAL ${timeRange}
          AND pii_sanitized = 1
      )
      GROUP BY pii_type
      ORDER BY count DESC
      LIMIT 10
    `;

    const typesResult = await client.query({
      query: typesQuery,
      format: 'JSONEachRow',
    });

    const typesData = await typesResult.json<any>();

    return {
      total_with_pii: overviewData[0]?.total_with_pii || 0,
      pii_detection_rate: overviewData[0]?.pii_detection_rate || 0,
      total_entities: overviewData[0]?.total_entities || 0,
      top_types: typesData,
    };
  } catch (error) {
    console.error('ClickHouse query error (getPIIStatsV2):', error);
    return {
      total_with_pii: 0,
      pii_detection_rate: 0,
      total_entities: 0,
      top_types: [],
    };
  }
}
