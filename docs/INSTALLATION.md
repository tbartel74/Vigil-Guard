# Installation Guide

> **Complete setup instructions for Vigil Guard**

## ⚠️ IMPORTANT: Model Download Required

**BEFORE INSTALLATION**, you must download Meta's Llama Prompt Guard 2 model separately:

### Why Separate Download?

Due to Meta's Llama 4 Community License, the model files:
- ❌ **Cannot** be included in this repository
- ✅ **Must** be downloaded by you after accepting Meta's license
- ✅ **Requires** Hugging Face account (free)

### Quick Download

```bash
# From Vigil Guard root directory
./scripts/download-llama-model.sh
```

The automated script will:
1. Check for Hugging Face CLI
2. Verify your authentication
3. Download model to `../vigil-llm-models/Llama-Prompt-Guard-2-86M` (~1.1 GB)
4. Validate the download

**OR** the installation script (`./install.sh`) will prompt you to download the model if it's not found.

For manual download instructions, see: [prompt-guard-api/README.md](../prompt-guard-api/README.md)

---

## 📋 Prerequisites

### System Requirements

| Component | Minimum Version | Recommended |
|-----------|----------------|-------------|
| **Node.js** | 18.0.0 | 20.x LTS |
| **npm** | 8.0.0 | Latest |
| **RAM** | 4GB | 8GB+ |
| **Storage** | 2GB free | 5GB+ |
| **OS** | Linux, macOS, Windows | Linux/macOS |

### Required Software

1. **Node.js & npm**
   ```bash
   # Check versions
   node --version  # Should be ≥18.0.0
   npm --version   # Should be ≥8.0.0

   # Install via Node Version Manager (recommended)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 18
   nvm use 18
   ```

2. **Docker** (for Grafana)
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh

   # Verify installation
   docker --version
   docker-compose --version
   ```

3. **Git**
   ```bash
   # Ubuntu/Debian
   sudo apt update && sudo apt install git

   # macOS
   brew install git

   # Verify installation
   git --version
   ```

## 🚀 Installation Steps

### Step 1: Clone Repository

```bash
# Clone the repository
git clone <repository-url>
cd vigil-guard

# Verify project structure
ls -la
# Should show: services/ docs/ scripts/ docker-compose.yml
```

### Step 2: Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Verify installation
npm list --depth=0

# Create required directories
mkdir -p logs config

# Set permissions (Linux/macOS)
chmod 755 logs config
```

#### Backend Environment Configuration

Create `.env` file in backend directory:
```bash
# backend/.env
NODE_ENV=development
PORT=8787
LOG_LEVEL=info
CONFIG_PATH=./config
AUDIT_LOG_PATH=./audit.log
MAX_BACKUPS=2
```

#### Verify Backend Installation

```bash
# Build TypeScript
npm run build

# Check build output
ls -la dist/
# Should show: server.js fileOps.js types.js

# Test backend startup (don't run in background yet)
npm run start
# Should show: "Server running on port 8787"
# Press Ctrl+C to stop
```

### Step 3: Frontend Setup

```bash
# Navigate to frontend directory (from project root)
cd frontend

# Install dependencies
npm install

# Verify installation
npm list --depth=0

# Create public directory for assets
mkdir -p public src/assets
```

#### Frontend Environment Configuration

Create `.env.development` file in frontend directory:
```bash
# frontend/.env.development
VITE_API_BASE_URL=http://localhost:8787
VITE_NO_CACHE=true
VITE_GRAFANA_URL=http://localhost:3001
```

Create `.env.production` file:
```bash
# frontend/.env.production
VITE_API_BASE_URL=/api
VITE_NO_CACHE=false
VITE_GRAFANA_URL=http://localhost:3001
```

#### Copy Logo Assets

```bash
# Copy logo from project root
cp ../docs/pic/vigil_logo.png public/
cp ../docs/pic/vigil_logo.png src/assets/

# Verify assets
ls -la public/ src/assets/
```

#### Verify Frontend Installation

```bash
# Build frontend
npm run build

# Check build output
ls -la dist/
# Should show built assets

# Test frontend development server (don't run in background yet)
npm run dev
# Should show: "Local: http://localhost:5173"
# Press Ctrl+C to stop
```

### Step 4: Grafana Setup

#### Start Grafana Container

```bash
# Create Grafana data directory
mkdir -p grafana-data

# Set permissions
sudo chown 472:472 grafana-data

# Start Grafana container
docker run -d \
  --name vigil-grafana \
  -p 3001:3000 \
  -v $(pwd)/grafana-data:/var/lib/grafana \
  -e GF_SECURITY_ALLOW_EMBEDDING=true \
  -e GF_SECURITY_COOKIE_SAMESITE=lax \
  -e GF_AUTH_ANONYMOUS_ENABLED=true \
  -e GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer \
  grafana/grafana:latest

# Verify Grafana is running
docker ps | grep vigil-grafana
curl -I http://localhost:3001
```

#### Configure Grafana

```bash
# Wait for Grafana to start (30 seconds)
sleep 30

# Reset admin password
docker exec -it vigil-grafana grafana-cli admin reset-admin-password admin

# Test login
curl -u admin:admin http://localhost:3001/api/health
```

For detailed Grafana configuration, see [GRAFANA_SETUP.md](./GRAFANA_SETUP.md).

## 🏃‍♂️ Running the Application

### Development Mode

#### Terminal 1: Backend
```bash
cd backend
npm run dev  # Uses nodemon for auto-restart
```

#### Terminal 2: Frontend
```bash
cd frontend
npm run dev  # Vite development server
```

#### Terminal 3: Verify Services
```bash
# Check backend
curl http://localhost:8787/api/config

# Check frontend
curl -I http://localhost:5173

# Check Grafana
curl -I http://localhost:3001
```

### Production Mode

#### Build Applications
```bash
# Build backend
cd backend
npm run build

# Build frontend
cd ../frontend
npm run build
```

#### Start Services
```bash
# Start backend
cd backend
npm run start &

# Serve frontend (using serve package)
cd ../frontend
npm install -g serve
serve -s dist -l 5173 &
```

## 🔧 Configuration Verification

### Test Configuration API

```bash
# Get current configuration
curl -s http://localhost:8787/api/config | jq '.' | head -20

# Test configuration update
curl -X POST http://localhost:8787/api/config \
  -H "Content-Type: application/json" \
  -H "If-Match: \"$(curl -s -I http://localhost:8787/api/config | grep -i etag | cut -d' ' -f2 | tr -d '\r')\"" \
  -d '{"LOG_LEVEL": "debug"}'
```

### Test Frontend-Backend Integration

```bash
# Open browser to frontend
open http://localhost:5173

# Navigate to Configuration tab
# Try updating a configuration value
# Verify changes are reflected immediately
```

### Test Grafana Integration

```bash
# Test Grafana iframe embedding
curl -s "http://localhost:3001/d-solo/dashboard-id/panel-name" | grep -i "x-frame-options"
# Should NOT return X-Frame-Options: DENY
```

## 🐳 Docker Installation (Alternative)

### Using Docker Compose

Create `docker-compose.yml` in project root:
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8787:8787"
    environment:
      - NODE_ENV=production
    volumes:
      - ./backend/config:/app/config
      - ./backend/logs:/app/logs
    depends_on:
      - grafana

  frontend:
    build: ./frontend
    ports:
      - "5173:80"
    depends_on:
      - backend

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ALLOW_EMBEDDING=true
      - GF_SECURITY_COOKIE_SAMESITE=lax
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
    volumes:
      - grafana-data:/var/lib/grafana

volumes:
  grafana-data:
```

Run with Docker Compose:
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 🚨 Troubleshooting

### Common Installation Issues

#### Node.js Version Issues
```bash
# Error: Node.js version too old
nvm install 18
nvm use 18
npm cache clean --force
```

#### Permission Issues (Linux/macOS)
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

#### Port Already in Use
```bash
# Find process using port
lsof -i :8787
lsof -i :5173
lsof -i :3001

# Kill process
kill -9 <PID>
```

#### Grafana Container Issues
```bash
# Remove and recreate container
docker stop vigil-grafana
docker rm vigil-grafana
docker volume rm vigil-grafana_grafana-data

# Restart with fresh data
docker run -d --name vigil-grafana -p 3001:3000 grafana/grafana:latest
```

### Verification Checklist

- [ ] Node.js ≥18.0.0 installed
- [ ] Backend dependencies installed (`node_modules` exists)
- [ ] Frontend dependencies installed
- [ ] Grafana container running on port 3001
- [ ] Backend API responding on port 8787
- [ ] Frontend loading on port 5173
- [ ] Configuration API accessible
- [ ] Grafana dashboards loading in frontend

### Performance Optimization

#### Backend Optimization
```bash
# Use PM2 for production
npm install -g pm2
pm2 start dist/server.js --name vigil-backend
pm2 startup
pm2 save
```

#### Frontend Optimization
```bash
# Enable Vite optimization
export VITE_OPTIMIZE_DEPS=true
npm run build

# Use nginx for production serving
sudo apt install nginx
# Configure nginx to serve frontend dist/
```

## 📚 Next Steps

1. **Configure Security Variables**: [CONFIGURATION.md](./CONFIGURATION.md)
2. **Setup Grafana Dashboards**: [GRAFANA_SETUP.md](./GRAFANA_SETUP.md)
3. **Test the Complete System**: Verify all components work together
4. **Setup Monitoring**: Configure alerts and notifications
5. **Backup Strategy**: Setup automated configuration backups

## 🔍 Validation Commands

Run these commands to verify successful installation:

```bash
# System health check
echo "=== System Health Check ==="
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "Backend: $(curl -s http://localhost:8787/api/config | jq -r 'keys | length') variables loaded"
echo "Frontend: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173)"
echo "Grafana: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001)"
echo "=== Health Check Complete ==="
```

Expected output:
```
=== System Health Check ===
Node.js: v18.x.x
npm: 8.x.x
Backend: 27 variables loaded
Frontend: 200
Grafana: 200
=== Health Check Complete ===
```

---

## 🔐 Security Best Practices

### ✅ Automatic Password Generation

**The installation automatically generates cryptographically secure passwords for ALL services.**

All passwords are generated using `openssl rand -base64` with sufficient entropy for production use.

### Installation Password Policy

#### 1. Auto-Generated Passwords (.env)

The `install.sh` script automatically creates `.env` with secure passwords:

```bash
# Auto-generated by install.sh (32+ characters each)
CLICKHOUSE_PASSWORD=<auto-generated-32-chars>
GF_SECURITY_ADMIN_PASSWORD=<auto-generated-32-chars>
JWT_SECRET=<auto-generated-48-chars>
SESSION_SECRET=<auto-generated-48-chars>
```

**⚠️ CRITICAL**: Save these passwords displayed during installation - they are shown **ONLY ONCE**!

**Note**: N8N credentials are NOT auto-generated. N8N uses an account creation wizard on first visit to http://localhost:5678. You will create username/password through the wizard interface during initial setup.

#### 2. Web UI Admin Password

The Web UI admin password is automatically generated during `install.sh` execution:

1. **Save password shown during installation** (displayed with other credentials)
2. Password is stored in `.env` as `WEB_UI_ADMIN_PASSWORD`
3. Login to http://localhost/ui with `admin/<password-from-install>`
4. **System forces password change** on first login
5. If lost: Re-run `./install.sh` to regenerate all passwords

#### 3. Verify Password Security

```bash
# Test ClickHouse with auto-generated password
curl -u admin:<PASSWORD_FROM_INSTALL> http://localhost:8123/ping

# Test Grafana with auto-generated password
curl -u admin:<PASSWORD_FROM_INSTALL> http://localhost:3001/api/health

# Login to Web UI with password from install.sh output
# System will force immediate password change
```

### Why This Is Critical

- **Default passwords = instant system takeover**
- All your data, configurations, and logs become exposed
- Attackers actively scan for default credentials 24/7
- Once compromised, attackers can:
  - Access sensitive security logs
  - Modify detection rules
  - Disable security features
  - Pivot to other systems

### Additional Security Hardening

#### Enable HTTPS in Production

```bash
# Update Caddy configuration for HTTPS
# Edit services/proxy/Caddyfile
```

#### Restrict Network Access

```bash
# Production: Bind services to localhost only
# Edit docker-compose.yml ports section:
# Example: "127.0.0.1:8787:8787" instead of "8787:8787"
```

#### Regular Security Updates

```bash
# Update Docker images monthly
docker-compose pull
docker-compose up -d

# Update npm dependencies
npm update
```

#### Audit Logging

```bash
# Review audit logs regularly
tail -f vigil_data/web-ui/audit.log

# Check for suspicious activities:
# - Multiple failed login attempts
# - Unexpected configuration changes
# - Access from unknown IPs
```

### Security Checklist

- [ ] Changed all passwords in .env file
- [ ] Changed Web UI admin password
- [ ] Verified new passwords work
- [ ] Configured HTTPS for production
- [ ] Restricted network access (if needed)
- [ ] Documented passwords in secure password manager
- [ ] Setup regular security update schedule
- [ ] Enabled audit log monitoring

**Remember:** Security is an ongoing process, not a one-time setup!