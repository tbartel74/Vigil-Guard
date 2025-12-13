/**
 * System Status Routes - Docker Containers Health
 * Extracted from server.ts as part of Sprint 2 refactoring
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth.js';

const router = Router();

interface ContainerStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'offline';
  version?: string;
  details?: string;
}

/**
 * GET /api/system/containers
 * Health status of all Docker containers in the Vigil Guard stack
 */
router.get("/containers", authenticate, async (req: Request, res: Response) => {
  const checkService = async (name: string, url: string, healthPath: string = '/health'): Promise<ContainerStatus> => {
    try {
      const response = await fetch(`${url}${healthPath}`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return {
          name,
          status: 'healthy',
          version: data.version || data.pipeline_version || 'unknown',
          details: data.status || 'operational'
        };
      } else {
        return {
          name,
          status: 'degraded',
          details: `HTTP ${response.status}`
        };
      }
    } catch (e: any) {
      return {
        name,
        status: 'offline',
        details: e.name === 'AbortError' ? 'timeout' : 'unreachable'
      };
    }
  };

  try {
    const [
      clickhouse,
      grafana,
      n8n,
      backend,
      presidio,
      languageDetector,
      heuristics,
      semantic,
      llmGuard
    ] = await Promise.all([
      checkService('ClickHouse', 'http://vigil-clickhouse:8123', '/ping'),
      checkService('Grafana', 'http://vigil-grafana:3000', '/api/health'),
      checkService('n8n Workflow', process.env.N8N_URL || 'http://vigil-n8n:5678', '/healthz'),
      checkService('Web UI Backend', 'http://vigil-web-ui-backend:8787', '/health'),
      checkService('PII Detection (Presidio)', process.env.PRESIDIO_URL || 'http://vigil-presidio-pii:5001'),
      checkService('Language Detector', process.env.LANGUAGE_DETECTOR_URL || 'http://vigil-language-detector:5002'),
      checkService('Branch A (Heuristics)', process.env.HEURISTICS_SERVICE_URL || 'http://vigil-heuristics:5005'),
      checkService('Branch B (Semantic)', process.env.SEMANTIC_SERVICE_URL || 'http://vigil-semantic-service:5006'),
      checkService('Branch C (LLM Safety Engine Analysis)', process.env.PROMPT_GUARD_URL || 'http://vigil-prompt-guard-api:8000')
    ]);

    const containers: ContainerStatus[] = [
      clickhouse,
      grafana,
      n8n,
      backend,
      { name: 'Web UI Frontend', status: 'healthy' as const, details: 'nginx' }, // Static (no health endpoint)
      { name: 'Caddy Proxy', status: 'healthy' as const, details: 'operational' }, // Static (no health endpoint)
      presidio,
      languageDetector,
      heuristics,
      semantic,
      llmGuard
    ];

    const healthyCount = containers.filter(c => c.status === 'healthy').length;
    const degradedCount = containers.filter(c => c.status === 'degraded').length;
    const offlineCount = containers.filter(c => c.status === 'offline').length;

    const overallStatus = offlineCount > 3 ? 'critical' :
                         (degradedCount > 0 || offlineCount > 0) ? 'degraded' :
                         'healthy';

    res.json({
      overall_status: overallStatus,
      summary: {
        total: containers.length,
        healthy: healthyCount,
        degraded: degradedCount,
        offline: offlineCount
      },
      containers,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error("Error checking system containers:", e);
    res.status(500).json({ error: "Failed to check container health", details: e.message });
  }
});

export default router;
