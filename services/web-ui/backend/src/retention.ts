import { getClickHouseClient } from './clickhouse.js';

// ============================================================================
// TYPES
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

// ============================================================================
// RETENTION CONFIG
// ============================================================================

/**
 * Get current retention configuration
 */
export async function getRetentionConfig(): Promise<RetentionConfig | null> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        id,
        events_raw_ttl_days,
        events_processed_ttl_days,
        merge_with_ttl_timeout_seconds,
        ttl_only_drop_parts,
        warn_disk_usage_percent,
        critical_disk_usage_percent,
        formatDateTime(last_modified_at, '%Y-%m-%dT%H:%i:%SZ') AS last_modified_at,
        last_modified_by
      FROM n8n_logs.retention_config
      WHERE id = 1
      LIMIT 1
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<RetentionConfig>();

    if (data.length > 0) {
      return data[0];
    }

    return null;
  } catch (error) {
    console.error('ClickHouse query error (getRetentionConfig):', error);
    throw error;
  }
}

/**
 * Update retention configuration and apply TTL changes to tables
 * @param config Partial retention config (only fields to update)
 * @param username Username of person making changes (for audit trail)
 */
export async function updateRetentionConfig(
  config: Partial<RetentionConfig>,
  username: string
): Promise<RetentionConfig> {
  const client = getClickHouseClient();

  try {
    // Build UPDATE statement dynamically
    const updates: string[] = [];
    const params: Record<string, any> = { username };

    if (config.events_raw_ttl_days !== undefined) {
      updates.push('events_raw_ttl_days = {events_raw_ttl_days:UInt16}');
      params.events_raw_ttl_days = config.events_raw_ttl_days;
    }
    if (config.events_processed_ttl_days !== undefined) {
      updates.push('events_processed_ttl_days = {events_processed_ttl_days:UInt16}');
      params.events_processed_ttl_days = config.events_processed_ttl_days;
    }
    if (config.merge_with_ttl_timeout_seconds !== undefined) {
      updates.push('merge_with_ttl_timeout_seconds = {merge_with_ttl_timeout_seconds:UInt32}');
      params.merge_with_ttl_timeout_seconds = config.merge_with_ttl_timeout_seconds;
    }
    if (config.ttl_only_drop_parts !== undefined) {
      updates.push('ttl_only_drop_parts = {ttl_only_drop_parts:UInt8}');
      params.ttl_only_drop_parts = config.ttl_only_drop_parts;
    }
    if (config.warn_disk_usage_percent !== undefined) {
      updates.push('warn_disk_usage_percent = {warn_disk_usage_percent:UInt8}');
      params.warn_disk_usage_percent = config.warn_disk_usage_percent;
    }
    if (config.critical_disk_usage_percent !== undefined) {
      updates.push('critical_disk_usage_percent = {critical_disk_usage_percent:UInt8}');
      params.critical_disk_usage_percent = config.critical_disk_usage_percent;
    }

    if (updates.length === 0) {
      // No updates to make, return current config
      const current = await getRetentionConfig();
      if (!current) {
        throw new Error('Retention config not found');
      }
      return current;
    }

    // Add audit fields
    updates.push('last_modified_at = now()');
    updates.push('last_modified_by = {username:String}');

    const updateQuery = `
      ALTER TABLE n8n_logs.retention_config
      UPDATE ${updates.join(', ')}
      WHERE id = 1
    `;

    await client.query({
      query: updateQuery,
      query_params: params,
    });

    // Apply TTL changes to actual tables if TTL days were updated
    if (config.events_raw_ttl_days !== undefined) {
      await applyTTLToTable('events_raw', config.events_raw_ttl_days);
    }
    if (config.events_processed_ttl_days !== undefined) {
      await applyTTLToTable('events_processed', config.events_processed_ttl_days);
    }

    // Return updated config
    const updatedConfig = await getRetentionConfig();
    if (!updatedConfig) {
      throw new Error('Failed to retrieve updated config');
    }

    console.log(`Retention config updated by ${username}:`, config);
    return updatedConfig;
  } catch (error) {
    console.error('ClickHouse update error (updateRetentionConfig):', error);
    throw error;
  }
}

/**
 * Apply TTL change to a specific table
 * @param tableName 'events_raw' or 'events_processed'
 * @param ttlDays Number of days to retain data
 */
async function applyTTLToTable(tableName: string, ttlDays: number): Promise<void> {
  const client = getClickHouseClient();

  // CRITICAL: Validate table name against whitelist to prevent SQL injection
  const ALLOWED_TABLES = ['events_raw', 'events_processed'];
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  // Validate ttlDays is a safe integer
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 3650) {
    throw new Error(`Invalid TTL days: ${ttlDays}`);
  }

  try {
    // MODIFY TTL on the table
    // Note: ClickHouse allows MODIFY TTL to change existing TTL expressions
    const alterQuery = `
      ALTER TABLE n8n_logs.${tableName}
      MODIFY TTL toDateTime(timestamp) + INTERVAL ${ttlDays} DAY DELETE
    `;

    await client.query({
      query: alterQuery,
    });

    console.log(`TTL updated for n8n_logs.${tableName}: ${ttlDays} days`);
  } catch (error) {
    console.error(`Failed to apply TTL to ${tableName}:`, error);
    throw error;
  }
}

// ============================================================================
// DISK USAGE STATISTICS
// ============================================================================

/**
 * Get disk usage statistics for each table
 */
export async function getDiskUsageStats(): Promise<DiskUsageStats[]> {
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT
        table AS table_name,
        sum(rows) AS total_rows,
        sum(bytes_on_disk) AS total_bytes,
        formatReadableSize(sum(bytes_on_disk)) AS total_bytes_human,
        sum(data_compressed_bytes) AS compressed_bytes,
        formatReadableSize(sum(data_compressed_bytes)) AS compressed_bytes_human,
        uniq(partition) AS partition_count,
        min(partition) AS oldest_partition,
        max(partition) AS newest_partition,
        if(sum(data_compressed_bytes) > 0,
           round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2),
           0) AS compression_ratio
      FROM system.parts
      WHERE database = 'n8n_logs'
        AND table IN ('events_raw', 'events_processed')
        AND active = 1
      GROUP BY table
      ORDER BY table
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<DiskUsageStats>();
    return data;
  } catch (error) {
    console.error('ClickHouse query error (getDiskUsageStats):', error);
    throw error;
  }
}

/**
 * Get system-level disk usage statistics
 */
export async function getSystemDiskStats(): Promise<SystemDiskStats> {
  const client = getClickHouseClient();

  try {
    const query = `
      WITH disk_totals AS (
        SELECT
          sum(total_space) AS total,
          sum(free_space) AS free,
          sum(total_space) - sum(free_space) AS used
        FROM system.disks
        WHERE name = 'default'
      )
      SELECT
        total AS total_space,
        formatReadableSize(total) AS total_space_human,
        free AS free_space,
        formatReadableSize(free) AS free_space_human,
        used AS used_space,
        formatReadableSize(used) AS used_space_human,
        round(used / total * 100, 2) AS used_percent
      FROM disk_totals
    `;

    const resultSet = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await resultSet.json<SystemDiskStats>();

    if (data.length > 0) {
      return data[0];
    }

    // Fallback if no data
    return {
      total_space: 0,
      total_space_human: '0 B',
      free_space: 0,
      free_space_human: '0 B',
      used_space: 0,
      used_space_human: '0 B',
      used_percent: 0,
    };
  } catch (error) {
    console.error('ClickHouse query error (getSystemDiskStats):', error);
    throw error;
  }
}

// ============================================================================
// DATA CLEANUP
// ============================================================================

/**
 * Force immediate cleanup of expired data
 * Executes OPTIMIZE TABLE FINAL to trigger TTL cleanup
 * @param tableName 'events_raw' or 'events_processed' or 'all'
 */
export async function forceCleanup(tableName: 'events_raw' | 'events_processed' | 'all'): Promise<void> {
  const client = getClickHouseClient();
  const ALLOWED_TABLES = ['events_raw', 'events_processed'];

  try {
    const tables = tableName === 'all' ? ALLOWED_TABLES : [tableName];

    for (const table of tables) {
      // CRITICAL: Validate table name before using in query to prevent SQL injection
      if (!ALLOWED_TABLES.includes(table)) {
        throw new Error(`Invalid table name: ${table}`);
      }

      // OPTIMIZE TABLE FINAL triggers merges and TTL cleanup
      const optimizeQuery = `OPTIMIZE TABLE n8n_logs.${table} FINAL`;
      await client.query({
        query: optimizeQuery,
      });

      console.log(`Force cleanup executed for n8n_logs.${table}`);
    }
  } catch (error) {
    console.error('ClickHouse command error (forceCleanup):', error);
    throw error;
  }
}

/**
 * Get partition information for a table
 * Useful for understanding data distribution and TTL status
 */
export async function getPartitionInfo(tableName: 'events_raw' | 'events_processed'): Promise<any[]> {
  const client = getClickHouseClient();

  // Defense in depth: validate even though we use parameterized query
  const ALLOWED_TABLES = ['events_raw', 'events_processed'];
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  try {
    const query = `
      SELECT
        partition,
        sum(rows) AS rows,
        formatReadableSize(sum(bytes_on_disk)) AS size,
        min(min_time) AS oldest_record,
        max(max_time) AS newest_record,
        count() AS part_count
      FROM system.parts
      WHERE database = 'n8n_logs'
        AND table = {tableName:String}
        AND active = 1
      GROUP BY partition
      ORDER BY partition DESC
      LIMIT 50
    `;

    const resultSet = await client.query({
      query,
      query_params: { tableName },
      format: 'JSONEachRow',
    });

    const data = await resultSet.json();
    return data;
  } catch (error) {
    console.error('ClickHouse query error (getPartitionInfo):', error);
    throw error;
  }
}
