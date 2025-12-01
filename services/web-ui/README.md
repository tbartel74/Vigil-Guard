# Web UI Service

Configuration interface and API backend for Vigil Guard.

## Architecture

```
services/web-ui/
├── frontend/          # React 18 + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── hooks/        # Custom React hooks
│   │   └── routes.tsx    # Page routing
│   └── public/           # Static assets
└── backend/           # Express.js + TypeScript
    ├── src/
    │   ├── server.ts     # Main server
    │   ├── auth.ts       # JWT authentication
    │   └── clickhouse.ts # ClickHouse queries
    └── tests/            # API tests
```

## Quick Start

### Development

```bash
# Frontend (hot reload)
cd frontend
npm install
npm run dev
# Access at http://localhost:5173/ui

# Backend (watch mode)
cd backend
npm install
npm run dev
# API at http://localhost:8787
```

### Production

Services run in Docker containers via docker-compose:
- Frontend served by Nginx
- Backend served by Node.js
- Caddy reverse proxy routes `/ui` to frontend

## Frontend

### Technologies
- **React 18** - UI framework
- **Vite** - Build tool with HMR
- **Tailwind CSS v4** - Utility-first styling
- **React Router** - Client-side routing

### Key Components

| Component | Purpose |
|-----------|---------|
| `Dashboard.tsx` | Monitoring overview |
| `Investigation.tsx` | Event search and analysis |
| `ConfigSection.tsx` | Configuration editor |
| `PIISettings.tsx` | PII detection settings |

### Build

```bash
npm run build
# Output: dist/ directory
```

## Backend

### Technologies
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **better-sqlite3** - User database
- **ClickHouse client** - Analytics queries

### API Endpoints

See [API Reference](../../docs/API.md) for complete documentation.

**Key Categories:**
- `/api/auth/*` - Authentication
- `/api/events-v2/*` - Event queries
- `/api/feedback/*` - False positive reports
- `/api/files/*` - Configuration management
- `/api/retention/*` - Data retention

### Environment Variables

```bash
# Required
JWT_SECRET=<64+ chars>
SESSION_SECRET=<64+ chars>
CLICKHOUSE_PASSWORD=<password>

# Optional
PORT=8787
NODE_ENV=production
```

## Authentication

- **JWT tokens** - 24h expiration
- **bcrypt** - Password hashing (12 rounds)
- **Rate limiting** - 5 login attempts / 15 min
- **RBAC** - Role-based permissions

### Permissions

| Permission | Access |
|------------|--------|
| `can_view_monitoring` | Dashboard, Investigation |
| `can_view_configuration` | Config editing |
| `can_manage_users` | User administration |

## Configuration

The Web UI manages configuration files in `/config`:
- `unified_config.json` - Main settings
- `rules.config.json` - Detection patterns
- `pii.conf` - PII redaction rules

**Important:** All changes are ETag-protected with automatic backups.

## Testing

```bash
# Backend tests
cd backend
npm test

# Type checking
npm run type-check
```

## Docker

```dockerfile
# Frontend
FROM node:20-alpine as build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Backend
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci
CMD ["node", "dist/server.js"]
```

## Related Documentation

- [API Reference](../../docs/API.md)
- [Authentication Guide](../../docs/AUTHENTICATION.md)
- [Configuration Guide](../../docs/guides/configuration.md)
