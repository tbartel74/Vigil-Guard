# Grafana Provisioning

This directory contains automated provisioning configuration for Grafana, which allows datasources and dashboards to be configured automatically when Grafana starts.

## Directory Structure

```
provisioning/
├── datasources/          # Datasource configurations
│   └── clickhouse.yml   # ClickHouse datasource
├── dashboards/          # Dashboard configurations
│   ├── default.yml      # Dashboard provider config
│   └── vigil-dashboard.json  # Vigil Guard dashboard
└── README.md           # This file
```

## How It Works

Grafana automatically loads configuration from `/etc/grafana/provisioning/` on startup:

1. **Datasources** (`datasources/*.yml`): Automatically configure database connections
2. **Dashboards** (`dashboards/*.yml` + `.json`): Automatically import dashboards

This is mounted via Docker volume in `docker-compose.yml`:
```yaml
volumes:
  - ./services/monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
```

## Datasource Configuration

**File:** `datasources/clickhouse.yml`

Configures ClickHouse datasource with:
- Name: `ClickHouse`
- URL: `http://vigil-clickhouse:8123`
- Database: `n8n_logs`
- Credentials: From environment variables
- Type: `vertamedia-clickhouse-datasource`

## Dashboard Configuration

**Provider:** `dashboards/default.yml`
**Dashboard:** `dashboards/vigil-dashboard.json`

The Vigil Guard dashboard includes 6 panels:
1. Input/Output Processing Table
2. TOP-10 Detection Categories
3. Volume + Status Distribution
4. Block Rate Percentage
5. Maliciousness Trend
6. Histogram Time Series

## Modifying Configuration

### Update Datasource

Edit `datasources/clickhouse.yml` and restart Grafana:
```bash
docker-compose restart grafana
```

### Update Dashboard

1. Make changes in Grafana UI
2. Export dashboard JSON (Share → Export → Save to file)
3. Replace `dashboards/vigil-dashboard.json`
4. Restart Grafana:
```bash
docker-compose restart grafana
```

### Add New Dashboard

1. Create `.json` file in `dashboards/` directory
2. Restart Grafana - it will be auto-imported

## First Installation

On first installation, provisioning happens automatically:

1. ClickHouse datasource is configured
2. Vigil dashboard is imported
3. Login with `admin / admin`
4. Dashboard available at: http://localhost:3001/d/6cf14bba-9b61-45d7-82c3-04e1005dea38/vigil

## References

- [Grafana Provisioning Documentation](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [ClickHouse Plugin](https://grafana.com/grafana/plugins/vertamedia-clickhouse-datasource/)
