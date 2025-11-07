import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SKIP = process.env.VG_SKIP_INSTALL_TESTS === '1'

const CLICKHOUSE_IMAGE =
  process.env.CLICKHOUSE_TEST_IMAGE ||
  'clickhouse/clickhouse-server:25.10.1'
const CONTAINER = `vg-install-test-${process.pid}`
const SQL_ROOT = path.resolve(
  __dirname,
  '../../../monitoring/sql'
)
const REQUIRED_FILES = [
  '01-create-tables.sql',
  '02-create-views.sql',
  '03-false-positives.sql',
  '05-retention-config.sql',
  '06-add-audit-columns-v1.7.0.sql'
]

const exec = (command, options = {}) =>
  execSync(command, {
    stdio: 'pipe',
    ...options
  })

const waitForClickHouse = async () => {
  const maxAttempts = 30
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      exec(
        `docker exec ${CONTAINER} clickhouse-client -q "SELECT 1"`,
        { stdio: 'ignore' }
      )
      return
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw new Error('ClickHouse test container did not become ready in time')
}

const ensureSqlFiles = () => {
  for (const file of REQUIRED_FILES) {
    const fullPath = path.join(SQL_ROOT, file)
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing SQL migration file: ${fullPath}`)
    }
  }
}

const runSqlFile = (file) => {
  const fullPath = path.join(SQL_ROOT, file)
  const sql = fs.readFileSync(fullPath, 'utf-8')
  exec(
    `docker exec -i ${CONTAINER} clickhouse-client --multiquery`,
    { input: sql }
  )
}

const resetDatabase = () => {
  exec(
    `docker exec ${CONTAINER} clickhouse-client -q "DROP DATABASE IF EXISTS n8n_logs"`
  )
  exec(
    `docker exec ${CONTAINER} clickhouse-client -q "CREATE DATABASE n8n_logs"`
  )
}

const applyMigrations = () => {
  runSqlFile('01-create-tables.sql')
  runSqlFile('06-add-audit-columns-v1.7.0.sql')
  runSqlFile('02-create-views.sql')
  runSqlFile('03-false-positives.sql')
  runSqlFile('05-retention-config.sql')
}

const listColumns = (table) => {
  const result = exec(
    `docker exec ${CONTAINER} clickhouse-client -q "DESCRIBE ${table} FORMAT JSON"`
  ).toString()
  const parsed = JSON.parse(result)
  return parsed.data.map((row) => row.name)
}

const showCreateView = (view) => {
  return exec(
    `docker exec ${CONTAINER} clickhouse-client -q "SHOW CREATE VIEW ${view}"`
  )
    .toString()
    .trim()
}

const hasDocker = () => {
  try {
    exec('docker info', { stdio: 'ignore' })
    return true
  } catch (error) {
    return false
  }
}

const shouldSkip = SKIP || !hasDocker()

const suite = shouldSkip ? describe.skip : describe

suite('ClickHouse installation migrations', () => {
  beforeAll(async () => {
    ensureSqlFiles()
    exec(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`)
    exec(
      `docker run -d --name ${CONTAINER} ${CLICKHOUSE_IMAGE}`,
      { stdio: 'ignore' }
    )
    await waitForClickHouse()
  }, 120000)

  afterAll(() => {
    exec(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`)
  })

  beforeEach(() => {
    resetDatabase()
  })

  it(
    'applies migrations in the expected order so views see audit columns',
    () => {
      applyMigrations()
      const columns = listColumns('n8n_logs.events_processed')
      expect(columns).toContain('pii_sanitized')
      expect(columns).toContain('client_id')

      const viewSchema = showCreateView('n8n_logs.v_grafana_prompts_table')
      expect(viewSchema).toContain('pii_sanitized')
      expect(viewSchema).toContain('browser_name')
    },
    60000
  )

  it(
    'is idempotent when run twice (no errors on reapply)',
    () => {
      expect(() => {
        applyMigrations()
        applyMigrations()
      }).not.toThrow()
    },
    60000
  )
})
