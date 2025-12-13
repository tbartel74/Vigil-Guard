import express from "express";
import cors from "cors";
import session from "express-session";
import rateLimit from "express-rate-limit";
import authRoutes from "./authRoutes.js";
import { authenticate } from "./auth.js";
import pluginConfigRoutes from "./pluginConfigRoutes.js";
import { initPluginConfigTable, getExternalDomain } from "./pluginConfigOps.js";
import retentionRoutes from "./retentionRoutes.js";
// Sprint 2 extracted routes
import eventsV2Routes from "./routes/eventsV2Routes.js";
import branchHealthRoutes from "./routes/branchHealthRoutes.js";
import piiDetectionRoutes from "./routes/piiDetectionRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";
import feedbackRoutes from "./routes/feedbackRoutes.js";
import configRoutes from "./routes/configRoutes.js";
// Sprint 2.2: Error handling
import { globalErrorHandler } from "./utils/asyncHandler.js";

const app = express();
const PORT = 8787;

// Trust first proxy (Caddy) for correct client IP detection
app.set('trust proxy', 1);

// Rate limiting for public plugin config endpoint (prevent brute force)
const pluginConfigLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 10, // 10 requests per minute per IP (reasonable for plugin refresh)
  standardHeaders: true, // Return RateLimit-* headers
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  handler: (req, res) => {
    console.warn(`[Rate Limit] Plugin config endpoint abuse detected from IP: ${req.ip}`);
    res.status(429).json({ error: "Too many requests, please try again later" });
  }
});

// Validate SESSION_SECRET is set (CRITICAL SECURITY REQUIREMENT)
if (!process.env.SESSION_SECRET) {
  console.error("❌ FATAL: SESSION_SECRET environment variable is not set!");
  console.error("This is a critical security requirement for JWT token encryption.");
  console.error("Please set SESSION_SECRET in your .env file.");
  console.error("");
  console.error("To fix this issue:");
  console.error("  1. Run: ./install.sh (will auto-generate secure passwords)");
  console.error("  2. Or manually generate: openssl rand -base64 64 | tr -d '/+=' | head -c 64");
  console.error("  3. Add to .env: SESSION_SECRET=<generated-value>");
  process.exit(1);
}

if (process.env.SESSION_SECRET.length < 32) {
  console.warn("⚠️  WARNING: SESSION_SECRET is too short!");
  console.warn("Minimum recommended length: 32 characters");
  console.warn("Current length:", process.env.SESSION_SECRET.length);
  console.warn("Use: openssl rand -base64 64 | tr -d '/+=' | head -c 64");
  console.warn("");
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,  // NO FALLBACK - fail-secure
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}) as unknown as express.RequestHandler);

// Dynamic CORS configuration with external domain support
// Allows: localhost (any port), external domain (http/https), undefined (same-origin)
app.use(
  cors({
    origin: async (origin, callback) => {
      // Allow requests with no origin (same-origin, Postman, curl, etc.)
      if (!origin) {
        return callback(null, true);
      }

      try {
        // Read external domain from unified_config.json
        const externalDomain = await getExternalDomain();

        // Build allowed origins list
        const allowedOrigins: RegExp[] = [
          /^http:\/\/localhost(:\d+)?$/,     // localhost with any port
          /^https?:\/\/localhost(:\d+)?$/,   // localhost with http/https
          /^chrome-extension:\/\/[a-z]+$/,   // Chrome extensions
          /^moz-extension:\/\/[a-f0-9-]+$/,  // Firefox extensions
        ];

        // Add external domain patterns (if not localhost)
        if (externalDomain && externalDomain !== 'localhost') {
          // Escape special regex characters in domain
          const escapedDomain = externalDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          // Allow both http and https for external domain
          allowedOrigins.push(
            new RegExp(`^https?://${escapedDomain}(:\\d+)?$`)
          );
        }

        // Check if origin matches any allowed pattern
        const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));

        if (isAllowed) {
          callback(null, true);
        } else {
          console.warn(`[CORS] Rejected origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      } catch (error) {
        console.error('[CORS] Error checking external domain:', error);
        // Fallback to localhost-only on error
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
          callback(null, true);
        } else {
          callback(new Error('CORS configuration error'));
        }
      }
    },
    credentials: true // Enable credentials for authentication
  })
);
app.use(express.json({ limit: "1mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Authentication routes (public)
app.use("/api/auth", authRoutes);

// Plugin configuration routes (public /plugin-config with rate limiting, protected /plugin-config/settings)
app.use("/api", pluginConfigRoutes(pluginConfigLimiter));

// Retention policy routes (protected - requires can_view_configuration)
app.use("/api/retention", retentionRoutes);

// ============================================================================
// SPRINT 2 EXTRACTED ROUTES (Modular Architecture v2.1.0)
// ============================================================================

// Events V2 endpoints (3-Branch Detection Architecture)
app.use("/api/events-v2", eventsV2Routes);

// Branch health checking endpoints
app.use("/api/branch", branchHealthRoutes);

// PII Detection endpoints (Presidio integration)
app.use("/api/pii-detection", piiDetectionRoutes);

// System status endpoints (Docker containers health)
app.use("/api/system", systemRoutes);

// Quality Feedback endpoints (FP/TP reporting)
app.use("/api/feedback", feedbackRoutes);

// Configuration management endpoints
app.use("/api", configRoutes);

// ============================================================================
// ERROR HANDLING (Sprint 2.2)
// ============================================================================

// Global error handler - must be last middleware
app.use(globalErrorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, () => {
  console.log(`Backend listening on http://0.0.0.0:${PORT}`);
  console.log(`[Sprint 2] Modular routes loaded: eventsV2, branchHealth, piiDetection, system, feedback, config`);

  // Initialize plugin configuration database table
  try {
    initPluginConfigTable();
    console.log('[Server] Plugin configuration table initialized');
  } catch (error) {
    console.error('[Server] Failed to initialize plugin config table:', error);
  }
});
