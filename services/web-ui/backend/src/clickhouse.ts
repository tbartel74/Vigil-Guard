/**
 * ClickHouse Module - Events V2 Schema (v2.0.0+)
 *
 * This module handles all ClickHouse queries for the events_v2 table.
 * Schema includes: 3-branch scores, arbiter decisions, PII detection.
 */

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

// ============================================================================
// QUICK STATS
// ============================================================================

export interface QuickStats {
  requests_processed: number;
  threats_blocked: number;
  content_sanitized: number;  // SANITIZED = PII redacted
}

export async function getQuickStats(timeRange: string = '24 HOUR'): Promise<QuickStats> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        count() AS requests_processed,
        countIf(final_status = 'BLOCKED') AS threats_blocked,
        countIf(final_status = 'SANITIZED') AS content_sanitized
      FROM n8n_logs.events_v2
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

    return {
      requests_processed: 0,
      threats_blocked: 0,
      content_sanitized: 0,
    };
  } catch (error) {
    console.error('ClickHouse query error:', error);
    return {
      requests_processed: 0,
      threats_blocked: 0,
      content_sanitized: 0,
    };
  }
}

export async function getQuickStats24h(): Promise<QuickStats> {
  return getQuickStats('24 HOUR');
}

// ============================================================================
// PROMPT LIST AND DETAILS
// ============================================================================

export interface PromptDetails {
  id: string;
  timestamp: string;
  input_raw: string;
  output_final: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  final_action: string;
  threat_score: number;
  branch_a_score: number;
  branch_b_score: number;
  branch_c_score: number;
  confidence: number;
  boosts_applied: string[];
}

export interface PromptListItem {
  id: string;
  timestamp: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  preview: string;
}

/**
 * Get list of prompts within time range for dropdown selector
 */
export async function getPromptList(timeRange: string): Promise<PromptListItem[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        toString(id) AS id,
        formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS timestamp,
        final_status,
        substring(original_input, 1, 100) AS preview
      FROM n8n_logs.events_v2
      WHERE timestamp >= now() - INTERVAL ${timeRange}
      ORDER BY timestamp DESC
      LIMIT 100
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
    const query = `
      SELECT
        toString(id) AS id,
        formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS timestamp,
        original_input AS input_raw,
        result AS output_final,
        final_status,
        final_decision AS final_action,
        threat_score,
        branch_a_score,
        branch_b_score,
        branch_c_score,
        confidence,
        boosts_applied
      FROM n8n_logs.events_v2
      WHERE toString(id) = {eventId:String}
      LIMIT 1
    `;

    const resultSet = await client.query({
      query,
      query_params: { eventId },
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

// ============================================================================
// FALSE POSITIVE REPORTING
// ============================================================================

export interface FalsePositiveReport {
  report_id?: string;
  event_id: string;
  reported_by: string;
  report_type?: 'FP' | 'TP';
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
    const reportData = {
      ...report,
      report_type: report.report_type || 'FP',
      event_timestamp: report.event_timestamp
        ? report.event_timestamp.replace('T', ' ').replace('Z', '').substring(0, 23)
        : undefined
    };

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
// FP REPORT LIST
// ============================================================================

export interface FPReportListParams {
  startDate?: string;
  endDate?: string;
  reportType?: 'FP' | 'TP' | 'ALL';
  reason?: string;
  reportedBy?: string;
  minScore?: number;
  maxScore?: number;
  sortBy?: 'report_timestamp' | 'event_timestamp' | 'threat_score';
  sortOrder?: 'ASC' | 'DESC';
  page: number;
  pageSize: number;
}

export interface FPReportDetailed {
  // Basic report fields
  report_id: string;
  event_id: string;
  reported_by: string;
  report_type: 'FP' | 'TP';
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
  decision_reason: string;

  // Decision Analysis fields
  final_action: string;
  removal_pct: number;
  processing_time_ms: number;
  pii_sanitized: number;
  pii_types_detected: string[];
  pii_entities_count: number;
  detected_language: string;
  decision_source: string;

  // Additional fields from events_v2 (for full branch analysis rendering)
  branch_a_score: number;
  branch_b_score: number;
  branch_c_score: number;
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

    const allowedSortColumns = ['report_timestamp', 'event_timestamp', 'threat_score'];
    const sortBy = allowedSortColumns.includes(params.sortBy || '')
      ? params.sortBy
      : 'report_timestamp';
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const columnMapping: Record<string, string> = {
      report_timestamp: 'fp.timestamp',
      event_timestamp: 'fp.event_timestamp',
      threat_score: 'fp.threat_score',
    };

    const safeSortColumn = columnMapping[sortBy!];

    // Count total
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

    // Fetch data with JOIN to events_v2
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
        ifNull(ep.branch_a_score, 0) AS branch_a_score,
        ifNull(ep.branch_b_score, 0) AS branch_b_score,
        ifNull(ep.branch_c_score, 0) AS branch_c_score
      FROM n8n_logs.false_positive_reports AS fp
      LEFT JOIN n8n_logs.events_v2 AS ep
        ON fp.event_id = toString(ep.id)
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

// ============================================================================
// FP STATISTICS
// ============================================================================

export interface FPReasonStats {
  reason: string;
  count: number;
  percentage: number;
  avg_threat_score: number;
}

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

export interface FPReporterStats {
  reported_by: string;
  count: number;
  recent_reports: number;
}

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

export interface FPCategoryStats {
  category: string;
  count: number;
  percentage: number;
}

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

export interface FPTrendData {
  date: string;
  count: number;
}

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
 * Get single FP report with full event context
 */
export async function getFPReportDetails(reportId: string): Promise<FPReportDetailed | null> {
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
        ifNull(ep.chat_input, '') AS chat_input,
        ifNull(ep.result, '') AS result,
        ifNull(ep.branch_a_score, 0) AS branch_a_score,
        ifNull(ep.branch_b_score, 0) AS branch_b_score,
        ifNull(ep.branch_c_score, 0) AS branch_c_score,
        ifNull(ep.detected_language, '') AS detected_language,
        toUInt8(ifNull(ep.pii_sanitized, 0)) AS pii_sanitized,
        ifNull(ep.pii_types_detected, []) AS pii_types_detected,
        toUInt32(ifNull(ep.pii_entities_count, 0)) AS pii_entities_count,
        ifNull(ep.confidence, 0) AS confidence,
        ifNull(ep.boosts_applied, []) AS boosts_applied,
        ifNull(ep.client_id, '') AS client_id,
        ifNull(ep.browser_name, '') AS browser_name,
        ifNull(ep.browser_version, '') AS browser_version,
        ifNull(ep.os_name, '') AS os_name,
        ifNull(ep.pipeline_version, '') AS pipeline_version,
        ifNull(ep.config_version, '') AS config_version,
        ep.arbiter_json,
        ep.branch_results_json,
        ep.pii_classification_json
      FROM n8n_logs.false_positive_reports AS fp
      LEFT JOIN n8n_logs.events_v2 AS ep
        ON fp.event_id = toString(ep.id)
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

    // Parse raw JSON strings
    const arbiterData = row.arbiter_json ? JSON.parse(row.arbiter_json) : null;
    const branchResults = row.branch_results_json ? JSON.parse(row.branch_results_json) : null;
    const piiClassification = row.pii_classification_json ? JSON.parse(row.pii_classification_json) : null;

    // Extract detected_categories from explanations or branch results
    // v2.0.0 doesn't have explicit categories array - extract from explanations
    const detectedCategories: string[] = [];
    if (arbiterData?.explanations) {
      // Extract category names from explanations like "Matched categories: MULTI_STEP_ATTACK, HEAVY_OBFUSCATION, FORMAT_COERCION (+1 more)"
      const categoryMatch = arbiterData.explanations.find((exp: string) => exp.includes('Matched categories:'));
      if (categoryMatch) {
        const categoriesStr = categoryMatch.replace('Matched categories:', '').replace(/\(\+\d+ more\)/, '').trim();
        detectedCategories.push(...categoriesStr.split(',').map((c: string) => c.trim()));
      }
    }

    // Transform to frontend interface shape
    return {
      // Basic report fields
      report_id: row.report_id,
      event_id: row.event_id,
      reported_by: row.reported_by,
      report_type: row.report_type,
      reason: row.reason,
      comment: row.comment,
      report_timestamp: row.report_timestamp,
      event_timestamp: row.event_timestamp,
      original_input: row.original_input,
      final_status: row.final_status,
      threat_score: row.threat_score,
      detected_categories: detectedCategories,

      // Computed fields from JSON (v2.0.0 format)
      sanitizer_score: arbiterData?.branches?.A?.score || 0,
      pg_score_percent: arbiterData?.branches?.C?.score || 0,
      decision_reason: arbiterData?.explanations?.join('; ') || '',
      final_action: arbiterData?.final_decision || row.final_status,
      removal_pct: 0, // Not tracked in v2.0.0
      processing_time_ms: 0, // Not tracked in detail
      pii_sanitized: row.pii_sanitized,
      pii_types_detected: row.pii_types_detected,
      pii_entities_count: row.pii_entities_count,
      detected_language: row.detected_language,
      decision_source: 'arbiter_v2', // v2.0.0 arbiter

      // Additional fields from events_v2 (for full branch analysis rendering)
      branch_a_score: row.branch_a_score,
      branch_b_score: row.branch_b_score,
      branch_c_score: row.branch_c_score,
      confidence: row.confidence,
      boosts_applied: row.boosts_applied,
      chat_input: row.chat_input,
      result: row.result,
      client_id: row.client_id,
      browser_name: row.browser_name,
      browser_version: row.browser_version,
      os_name: row.os_name,
      pipeline_version: row.pipeline_version,
      config_version: row.config_version,

      // RAW JSON fields (for detailed branch analysis like Monitoring)
      arbiter_json: arbiterData,
      branch_results_json: branchResults,
      pii_classification_json: piiClassification,

      // Map pii_classification_json → sanitizer_breakdown
      // Note: v2.0.0 workflow saves simplified PII data without language_stats/entities details
      sanitizer_breakdown: piiClassification && row.pii_sanitized === 1 ? {
        decision: row.final_status,
        removal_pct: 0,
        mode: piiClassification.method || 'presidio',
        score: 0,
        breakdown: {},
        pii: {
          has: true,
          entities_detected: piiClassification.count || row.pii_entities_count || 0,
          detection_method: piiClassification.method || 'presidio',
          processing_time_ms: 0,
          // Simplified language_stats (reconstructed from available data)
          language_stats: {
            detected_language: row.detected_language || 'unknown',
            detection_confidence: 0.8, // Default confidence - not stored in v2.0.0
            detection_method: 'hybrid',
            polish_entities: piiClassification.types?.filter((t: string) => t.startsWith('PL_')).length || 0,
            english_entities: piiClassification.types?.filter((t: string) => !t.startsWith('PL_')).length || 0,
            regex_entities: 0, // Not available in simplified PII data
          },
          // Note: Individual entities array not stored in v2.0.0
          // Frontend will gracefully handle missing entities with conditional rendering
          entities: [],
        },
      } : undefined,

      // Map arbiter_json → scoring_breakdown
      // Note: v2.0.0 has different structure (3-branch format)
      scoring_breakdown: arbiterData ? {
        sanitizer_score: 0, // Not in v2.0.0 arbiter format
        prompt_guard_score: 0, // Replaced by Branch C (LLM Guard)
        prompt_guard_percent: arbiterData.branches?.C?.score || 0,
        threat_score: arbiterData.combined_score || row.threat_score || 0,
        score_breakdown: {
          branch_a: arbiterData.branches?.A?.score || 0,
          branch_b: arbiterData.branches?.B?.score || 0,
          branch_c: arbiterData.branches?.C?.score || 0,
        },
        // Extract match_details from explanations if available
        match_details: arbiterData.explanations ? arbiterData.explanations.map((exp: string, idx: number) => ({
          category: 'EXPLANATION',
          matchCount: 1,
          score: 0,
          matches: [{ pattern: exp, samples: [] }],
        })) : [],
      } : undefined,

      // Map arbiter_json → final_decision
      // Note: v2.0.0 format has simpler final_decision (string, not object)
      final_decision: arbiterData ? {
        status: arbiterData.final_decision || row.final_status,
        action_taken: arbiterData.final_decision || row.final_status,
        source: 'arbiter_v2',
        internal_note: arbiterData.explanations?.join('; ') || '',
      } : undefined,

      // Map pipeline_flow - reconstructed from available data
      // Note: pipeline_flow_json column doesn't exist in events_v2 schema
      // Reconstruct basic pipeline flow from available fields
      pipeline_flow: {
        input_raw: row.original_input,
        input_normalized: row.chat_input || row.original_input,
        after_sanitization: row.result || row.chat_input || '',
        after_pii_redaction: piiClassification?.has ? '(PII redacted)' : row.chat_input || '',
        output_final: row.result || '',
        output_status: row.final_status,
      },

      // Pattern matches (same as match_details for compatibility)
      pattern_matches: arbiterData?.match_details || [],
    };
  } catch (error) {
    console.error('ClickHouse query error (FP report details):', error);
    return null;
  }
}

// ============================================================================
// INVESTIGATION SEARCH
// ============================================================================

export interface SearchParams {
  startDate?: string;
  endDate?: string;
  textQuery?: string;
  clientId?: string;
  status?: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  minScore?: number;
  maxScore?: number;
  categories?: string[];  // Legacy field, ignored in v2 (no categories in events_v2)
  sortBy?: 'timestamp' | 'threat_score' | 'final_status';
  sortOrder?: 'ASC' | 'DESC';
  page: number;
  pageSize: number;
}

export interface SearchResultRow {
  id: string;  // UUID
  timestamp: string;
  client_id: string;
  prompt_input: string;
  final_status: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  threat_score: number;
  branch_a_score: number;
  branch_b_score: number;
  branch_c_score: number;
  pii_sanitized: boolean;
  boosts_applied: string[];
  browser_name?: string;
  browser_version?: string;
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

    if (params.startDate) {
      whereConditions.push('timestamp >= {startDate:DateTime}');
      queryParams.startDate = params.startDate.replace('T', ' ').replace('Z', '');
    }
    if (params.endDate) {
      whereConditions.push('timestamp <= {endDate:DateTime}');
      queryParams.endDate = params.endDate.replace('T', ' ').replace('Z', '');
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

    if (params.minScore !== undefined && params.minScore !== null) {
      whereConditions.push('threat_score >= {minScore:UInt8}');
      queryParams.minScore = params.minScore;
    }
    if (params.maxScore !== undefined && params.maxScore !== null) {
      whereConditions.push('threat_score <= {maxScore:UInt8}');
      queryParams.maxScore = params.maxScore;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Count total
    const countQuery = `
      SELECT count() as total
      FROM n8n_logs.events_v2
      ${whereClause}
    `;

    const totalResult = await client.query({
      query: countQuery,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const totalData = await totalResult.json<{total: string}>();
    const total = totalData.length > 0 ? Number(totalData[0].total) : 0;

    // Fetch data
    const offset = (params.page - 1) * params.pageSize;
    const sortBy = params.sortBy || 'timestamp';
    const sortOrder = params.sortOrder || 'DESC';

    const allowedSortColumns = ['timestamp', 'threat_score', 'final_status'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'timestamp';

    const dataQuery = `
      SELECT
        toString(id) AS id,
        formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS timestamp,
        client_id,
        original_input AS prompt_input,
        final_status,
        threat_score,
        branch_a_score,
        branch_b_score,
        branch_c_score,
        pii_sanitized,
        boosts_applied,
        browser_name,
        browser_version,
        os_name
      FROM n8n_logs.events_v2
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

    const rows = await dataResult.json<any>();

    return {
      rows: rows.map((row: any) => ({
        ...row,
        pii_sanitized: row.pii_sanitized === 1,
      })),
      total,
    };
  } catch (error) {
    console.error('ClickHouse query error (searchPrompts):', error);
    throw error;
  }
}

// ============================================================================
// PII STATISTICS
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
 * Get PII entity type distribution
 */
export async function getPIITypeStats(timeRange: string = '24 HOUR'): Promise<PIITypeStats[]> {
  const client = getClickHouseClient();

  try {
    const query = `
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

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    return await resultSet.json<PIITypeStats>();
  } catch (error) {
    console.error('ClickHouse query error (getPIITypeStats):', error);
    return [];
  }
}

/**
 * Get PII detection overview statistics
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
      FROM n8n_logs.events_v2
      WHERE timestamp >= now() - INTERVAL ${timeRange}
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<any>();

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
