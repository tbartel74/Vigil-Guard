/**
 * Branch Health Routes - 3-Branch Service Status
 * Extracted from server.ts as part of Sprint 2 refactoring
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth.js';

const router = Router();

/**
 * GET /api/branches/health
 * Health status of all 3 detection branches
 */
router.get("/health", authenticate, async (req: Request, res: Response) => {
  const heuristicsUrl = process.env.HEURISTICS_SERVICE_URL || 'http://vigil-heuristics:5005';
  const semanticUrl = process.env.SEMANTIC_SERVICE_URL || 'http://vigil-semantic-service:5006';
  const llmGuardUrl = process.env.PROMPT_GUARD_URL || 'http://vigil-prompt-guard-api:8000';

  const checkService = async (name: string, url: string) => {
    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const data = await response.json();
        return { name, status: 'healthy', version: data.version || 'unknown', latency_ms: 0 };
      } else {
        return { name, status: 'unhealthy', error: `HTTP ${response.status}`, latency_ms: 0 };
      }
    } catch (e: any) {
      return { name, status: 'offline', error: e.message, latency_ms: 0 };
    }
  };

  try {
    const [branchA, branchB, branchC] = await Promise.all([
      checkService('heuristics', heuristicsUrl),
      checkService('semantic', semanticUrl),
      checkService('llm_guard', llmGuardUrl),
    ]);

    const allHealthy = branchA.status === 'healthy' && branchB.status === 'healthy' && branchC.status === 'healthy';
    const anyHealthy = branchA.status === 'healthy' || branchB.status === 'healthy' || branchC.status === 'healthy';

    const overallStatus = allHealthy ? 'healthy' : (anyHealthy ? 'degraded' : 'offline');
    const httpStatus = overallStatus === 'degraded' ? 503 : 200;

    res.status(httpStatus).json({
      overall_status: overallStatus,
      branches: {
        A: branchA,
        B: branchB,
        C: branchC,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("Error checking branch health:", e);
    res.status(500).json({ error: "Failed to check branch health", details: e.message });
  }
});

/**
 * GET /api/prompt-guard/health
 * Prompt Guard LLM service health check
 */
router.get("/prompt-guard/health", authenticate, async (req: Request, res: Response) => {
  const promptGuardUrl = process.env.PROMPT_GUARD_URL || 'http://vigil-prompt-guard-api:8000';

  try {
    const response = await fetch(`${promptGuardUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      console.error(`Prompt Guard health check failed: HTTP ${response.status}`);
      return res.status(503).json({
        status: 'unhealthy',
        model_loaded: false,
        http_status: response.status,
        error: `Service returned HTTP ${response.status}`
      });
    }

    const data = await response.json();
    res.json({ ...data, status: 'healthy' });

  } catch (e: any) {
    const errorType = e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';

    console.error(`Prompt Guard health check ${errorType}:`, e.message, {
      error_id: 'PROMPT_GUARD_HEALTH_FAILED',
      url: promptGuardUrl,
      error_type: errorType
    });

    // Return 503 Service Unavailable for monitoring systems
    res.status(503).json({
      status: 'unhealthy',
      model_loaded: false,
      error: e.message,
      error_type: errorType
    });
  }
});

export default router;
