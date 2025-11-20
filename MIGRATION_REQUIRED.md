# CRITICAL: ClickHouse Migration Required

## ⚠️ IMPORTANT: Run Before Deploying v1.8.2

This version adds support for True Positive (TP) reporting alongside existing False Positive (FP) reporting.
A database migration is **REQUIRED** before deploying this code to production.

## Migration Steps

### 1. Check if Migration is Needed

First, check if your `false_positive_reports` table already has the `report_type` column:

```sql
DESCRIBE TABLE n8n_logs.false_positive_reports;
```

If you see `report_type` in the output, you can skip the migration.

### 2. Apply the Migration

If the column doesn't exist, run the following migration:

```sql
-- Add report_type column to existing table
ALTER TABLE n8n_logs.false_positive_reports
ADD COLUMN IF NOT EXISTS report_type LowCardinality(String) DEFAULT 'FP'
AFTER reported_by;

-- Update all existing records to 'FP' (they were all false positives before this change)
ALTER TABLE n8n_logs.false_positive_reports
UPDATE report_type = 'FP'
WHERE report_type = '';
```

Or use the provided migration file:

```bash
# Using Docker
docker exec -i vigil-clickhouse clickhouse-client --multiquery < services/monitoring/sql/migrations/add_report_type.sql

# Or directly if ClickHouse client is installed
clickhouse-client --host localhost --port 8123 --user admin --password $CLICKHOUSE_PASSWORD --multiquery < services/monitoring/sql/migrations/add_report_type.sql
```

### 3. Verify Migration

After running the migration, verify it worked:

```sql
-- Check the column exists
DESCRIBE TABLE n8n_logs.false_positive_reports;

-- Check existing data has report_type set
SELECT count() AS total,
       countIf(report_type = 'FP') AS fp_count,
       countIf(report_type = 'TP') AS tp_count
FROM n8n_logs.false_positive_reports;
```

## What Happens Without Migration?

If you deploy this code without running the migration:

1. **New feedback submissions will fail** with error: `Unknown field report_type`
2. Users will see "Failed to submit report" when trying to report FP or TP
3. The Investigation Panel quality reporting feature will be broken

## Rollback Plan

If you need to rollback, the new column is backward compatible:
- Old code will ignore the `report_type` column
- New code defaults to 'FP' if the column is missing
- No data loss will occur

## For New Installations

New installations using the latest `03-false-positives.sql` will have the column created automatically.
This migration is only needed for existing deployments.

## Related Files

- **Migration Script:** `services/monitoring/sql/migrations/add_report_type.sql`
- **Table Schema:** `services/monitoring/sql/03-false-positives.sql`
- **Backend Code:** `services/web-ui/backend/src/server.ts` (line 813-825)
- **Frontend Code:** `services/web-ui/frontend/src/lib/api.ts` (line 370)