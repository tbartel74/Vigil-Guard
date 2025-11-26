# Utrzymanie

Last updated: 2025-11-26

## Backupy
- `vigil_data/` – konfiguracja i users.db; regularne snapshoty.
- ClickHouse – dump tabeli `n8n_logs.events_v2` wg potrzeb (backup retencji).

## Aktualizacje
- Pull latest changes, rebuild images (`docker-compose build --no-cache`), restart.
- Confirm NLP safety and PII model compatibility (endpoints unchanged).

## Monitoring
- Grafana (port 3000) – dashboards based on `events_v2` (branch_a/b/c_score, threat_score, final_status).
- Service logs: `docker-compose logs -f <service>`.

## Health checks
- Web UI backend `/api/system/containers` – branch latencies/status.
- ClickHouse availability: `curl http://localhost:8123/`.

## Data retention
- Retention managed in ClickHouse via SQL (see files in `services/monitoring/sql`).
