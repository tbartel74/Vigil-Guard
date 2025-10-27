---
name: react-tailwind-vigil-ui
description: React 18 + Vite + Tailwind CSS v4 frontend development for Vigil Guard configuration interface. Use when building UI components, creating forms, implementing API integration, working with JWT authentication, managing routing, or handling ETag-based concurrency control.
version: 1.0.0
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# Vigil Guard Web UI Development

## Overview
Frontend development guidance for Vigil Guard's React-based configuration and monitoring interface, built with Vite, TypeScript, and Tailwind CSS v4, featuring JWT authentication, RBAC, and Grafana integration.

## When to Use This Skill
- Building new React components
- Creating configuration forms with validation
- Implementing API client integration
- Working with AuthContext and JWT tokens
- Setting up protected routes with RBAC
- Styling with Tailwind CSS Design System
- Managing state (AuthContext, form state)
- Handling ETag concurrency for config updates
- Integrating Grafana dashboards
- Debugging CORS or proxy issues

## ⚠️ Critical: Reverse Proxy Architecture

**PRODUCTION ACCESS**: All requests go through Caddy reverse proxy!

```
Client → http://localhost/ui/
  ↓
Caddy (:80) strips /ui prefix
  ↓
Nginx (:80 internal) serves React SPA
  ↓
Vite build (base: "/ui/")
```

**Key Points:**
- Vite config: `base: "/ui/"` (assets have /ui/ prefix in HTML)
- Caddy strips `/ui` before proxying to nginx
- Nginx receives requests WITHOUT /ui/ prefix
- Keep nginx config simple: `try_files $uri $uri/ /index.html`
- **Never add nginx location blocks for /ui/**

## Tech Stack
- React 18.3.1
- Vite 6.0.1 (build tool, dev server)
- TypeScript 5.6.3
- Tailwind CSS v4.0 (Design System)
- React Router 7.1.1
- JWT authentication + localStorage

## Project Structure
```
services/web-ui/frontend/
├── src/
│   ├── components/           # React components
│   │   ├── Login.tsx        # Auth form
│   │   ├── UserManagement.tsx  # Admin panel
│   │   ├── ConfigEditor.tsx    # Config UI
│   │   ├── GrafanaEmbed.tsx    # Monitoring
│   │   └── TopBar.tsx          # Nav header
│   ├── contexts/
│   │   └── AuthContext.tsx  # Global auth state
│   ├── lib/
│   │   └── api.ts           # Backend API client
│   ├── spec/
│   │   └── variables.json   # Config variable specs
│   ├── App.tsx              # Main app + routing
│   └── main.tsx             # Entry point
├── public/
│   └── docs/                # GUI help system
├── vite.config.ts           # Vite configuration
├── tailwind.config.ts       # Design System
└── nginx.conf               # Production server
```

## Common Tasks

### Create New Component
```typescript
// src/components/MyComponent.tsx
import { useState } from 'react';

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

export default function MyComponent({ title, onAction }: MyComponentProps) {
  const [state, setState] = useState<string>('');

  return (
    <div className="bg-surface-base border border-border-subtle rounded-lg p-4">
      <h2 className="text-text-primary text-lg font-semibold">{title}</h2>
      <button
        onClick={onAction}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
      >
        Action
      </button>
    </div>
  );
}
```

### Add Protected Route
```typescript
// src/App.tsx
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Protected route with permission check */}
      <Route
        path="/config"
        element={
          user?.permissions.can_view_configuration ?
            <ConfigEditor /> :
            <Navigate to="/" />
        }
      />
    </Routes>
  );
}
```

### API Integration
```typescript
// Use API client from lib/api.ts
import api from '../lib/api';

async function fetchConfigFiles() {
  try {
    const response = await api.get('/api/files');
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      // Token expired, redirect to login
      window.location.href = '/login';
    }
    throw error;
  }
}
```

### ETag Concurrency Control
```typescript
// Optimistic locking for config saves
const [etag, setEtag] = useState<string>('');

// 1. Fetch with ETag
const response = await api.get('/api/parse/unified_config.json');
setEtag(response.headers['etag']);
setData(response.data);

// 2. Save with ETag validation
try {
  await api.post('/api/save', {
    name: 'unified_config.json',
    content: updatedData,
    etag: etag,
    username: user.username
  });
} catch (error) {
  if (error.response?.status === 412) {
    alert('File was modified by another user. Please refresh.');
  }
}
```

## Design System (Tailwind CSS v4)

### Semantic Color Tokens
```css
/* Background colors */
bg-surface-base        /* Main background #0F1419 */
bg-surface-dark        /* Cards, panels #131A21 */
bg-surface-darker      /* Sidebar #0C1117 */

/* Text colors */
text-text-primary      /* Main text #E6EDF3 */
text-text-secondary    /* Muted text #8B949E */
text-text-muted        /* Disabled text #57606A */

/* Border colors */
border-border-subtle   /* Dividers #30363D */
border-border-muted    /* Inactive borders #21262D */

/* Accent colors */
bg-blue-600           /* Primary actions */
bg-green-600          /* Success states */
bg-red-600            /* Danger/errors */
bg-yellow-600         /* Warnings */
```

### Reusable Components
```typescript
// Button component
<button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors">
  Save Changes
</button>

// Card container
<div className="bg-surface-dark border border-border-subtle rounded-lg p-6">
  Content
</div>

// Form input
<input
  type="text"
  className="bg-surface-darker border border-border-subtle text-text-primary rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
/>
```

## Authentication Flow

### JWT Token Management
```typescript
// AuthContext provides:
const { user, login, logout, loading } = useAuth();

// Login
await login(username, password);
// Sets token in localStorage
// Updates AuthContext.user

// Logout
logout();
// Removes token from localStorage
// Clears AuthContext.user
// Redirects to /login
```

### Permission Checks
```typescript
// Component-level
{user?.permissions.can_manage_users && (
  <UserManagement />
)}

// Route-level (see Add Protected Route above)
```

### API Token Injection
```typescript
// api.ts automatically adds JWT to headers
const token = localStorage.getItem('token');
if (token) {
  config.headers.Authorization = `Bearer ${token}`;
}
```

## Configuration Forms

### Variable Groups (from spec/variables.json)
1. Quick Settings - Test mode, logging
2. Detection Tuning - Thresholds, scoring
3. Performance - Timeouts, limits
4. Advanced - Normalization, sanitization

### Form Pattern
```typescript
const [values, setValues] = useState<Record<string, any>>({});

// Fetch current values
const loadConfig = async () => {
  const response = await api.get('/api/resolve');
  setValues(response.data);
};

// Update value
const handleChange = (varName: string, newValue: any) => {
  setValues(prev => ({ ...prev, [varName]: newValue }));
};

// Save with validation
const handleSave = async () => {
  await api.post('/api/save', {
    changes: values,
    username: user.username
  });
};
```

## Grafana Integration

### Embed Panel
```typescript
<iframe
  src={`http://localhost:3001/d/vigil-guard/dashboard?panelId=1&orgId=1&theme=dark&kiosk`}
  className="w-full h-96 border-0"
  title="Grafana Dashboard"
/>
```

**Requirements:**
- Grafana config: `GF_SECURITY_ALLOW_EMBEDDING=true`
- Use `kiosk` mode to hide Grafana UI
- Add `theme=dark` for consistency

## Development Workflow

### Local Development
```bash
cd services/web-ui/frontend

# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# TypeScript type checking
npx tsc --noEmit

# Build for production
npm run build
```

### Docker Build
```bash
# Build frontend image
docker-compose build web-ui-frontend

# Or full stack
docker-compose up --build
```

## Troubleshooting

### CORS Errors
```typescript
// Backend (services/web-ui/backend/src/server.ts)
app.use(cors({
  origin: /^http:\/\/localhost(:\d+)?$/, // Any localhost port
  credentials: true
}));
```

### Proxy 404 Errors
```typescript
// Check Vite config
export default {
  base: "/ui/", // Must match Caddy route
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787' // Backend dev server
    }
  }
}
```

### Token Expired
```typescript
// api.ts interceptor handles 401
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

## Best Practices
1. **Use Design System** - Semantic color tokens only
2. **Type everything** - Leverage TypeScript
3. **Handle errors** - User-friendly messages
4. **Validate forms** - Client-side validation
5. **Loading states** - Show spinners during API calls
6. **Responsive design** - Mobile-first approach
7. **Accessibility** - ARIA labels, keyboard navigation
8. **ETag always** - Prevent concurrent edit conflicts

## Related Skills
- `n8n-vigil-workflow` - Understanding what the UI configures
- `clickhouse-grafana-monitoring` - Grafana dashboard integration
- `docker-vigil-orchestration` - Deployment and nginx configuration

## References
- Frontend code: `services/web-ui/frontend/src/`
- API client: `services/web-ui/frontend/src/lib/api.ts`
- Variable specs: `services/web-ui/frontend/src/spec/variables.json`
- Design system: `services/web-ui/frontend/tailwind.config.ts`
- Web UI CLAUDE.md: `services/web-ui/CLAUDE.md`
