# Security Guide

> **Comprehensive security practices and guidelines for Vigil Guard deployment**

## ⚠️ CRITICAL: Credentials Policy

**Vigil Guard automatically generates cryptographically secure passwords for ClickHouse, Grafana, and session secrets during installation.**

### Installation Security

When you run `install.sh`, the system:

1. **Detects any default passwords** in `.env` file
2. **Auto-generates secure credentials** for ClickHouse, Grafana, and backend session using `openssl rand -base64 32`
3. **Displays credentials once** on screen (passwords are NOT saved to a file)
4. **Updates `.env`** file with new credentials

| Service | Username | Password | Port |
|---------|----------|----------|------|
| **Web UI** | `admin` | Auto-generated (32 chars) ⚠️ **Shown once at startup** | 5173 |
| **Grafana** | `admin` | Auto-generated (32 chars) | 3001 |
| **ClickHouse** | `admin` | Auto-generated (32 chars) | 8123 |
| **n8n** | (create on first access) | - | 5678 |

### ⚠️ CRITICAL: Save Your Credentials

After installation completes:

**During installation, the script displays auto-generated passwords on screen ONE TIME ONLY.**

1. **COPY the displayed passwords** (ClickHouse, Grafana, Session Secret) to a secure password manager **immediately**
2. These passwords are **NOT** shown again after the installation screen
3. You will need them to access Grafana and ClickHouse
4. If lost, you can regenerate by re-running `./install.sh`

### Security Recommendations

1. **Development/Testing**:
   - ✅ All passwords (Web UI, ClickHouse, Grafana) are auto-generated and cryptographically secure
   - ⚠️ **IMPORTANT**: Save Web UI password from `install.sh` output during installation
   - ⚠️ **Force password change** required on first Web UI login
2. **Production Deployment**:
   - ✅ **All service passwords auto-generated** (32+ characters, cryptographically secure)
   - ⚠️ **Save Web UI admin password** from `install.sh` output immediately
   - ⚠️ **Change Web UI password** on first login (forced by system)
   - ⚠️ **Save all credentials** (displayed during `./install.sh` execution) to password manager
   - ⚠️ **Enable HTTPS via Caddy reverse proxy**
   - ⚠️ **Restrict network access to services (firewall rules)**

### Automatic Password Rotation Security

**🔒 CRITICAL SECURITY FEATURE**: When `install.sh` generates new passwords, it automatically removes old ClickHouse data volumes to prevent password mismatches.

**What happens during password regeneration:**

1. **Detection Phase**: `install.sh` detects if:
   - `.env` file doesn't exist (fresh install)
   - Auto-generated passwords validation
   - Missing `SESSION_SECRET`

2. **Password Generation Phase**:
   - Generates 32+ character random passwords using `openssl rand`
   - Updates `.env` file with new credentials
   - Updates Grafana datasource config template

3. **Automatic Cleanup Phase**:
   ```bash
   # Verifies Docker daemon is accessible
   docker info

   # Stops ClickHouse container if running
   docker-compose stop clickhouse

   # Removes container
   docker-compose rm -f clickhouse

   # Removes old volume data (prevents password conflicts)
   rm -rf vigil_data/clickhouse

   # Verifies deletion succeeded
   [ -d vigil_data/clickhouse ] && exit 1
   ```

4. **Clean Start Phase**:
   - ClickHouse starts with clean, empty volume
   - New password is used from the start
   - No old credentials remain in any cache or volume
   - Init scripts create fresh database schema

**Why This Matters:**
- ✅ Prevents authentication failures due to password mismatches
- ✅ Ensures old passwords cannot be used after rotation
- ✅ Eliminates security risk of cached credentials
- ✅ Automatic - no manual intervention required

**To Regenerate All Passwords:**
```bash
# Simply re-run install.sh
./install.sh

# Script will:
# 1. Detect existing installation
# 2. Automatically clean up old ClickHouse volume
# 3. Generate new passwords
# 4. Display credentials ONCE (save them!)
# 5. Reinitialize database with new password
```

### How to Rotate Credentials

Credentials are automatically generated during installation. To rotate them manually:

#### Step 1: Stop All Services
```bash
docker-compose down
```

#### Step 2: Generate New Passwords
```bash
# Generate secure random passwords (32 characters)
CLICKHOUSE_PASS=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
GRAFANA_PASS=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
N8N_PASS=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')

# Display generated passwords
echo "ClickHouse: $CLICKHOUSE_PASS"
echo "Grafana: $GRAFANA_PASS"
echo "n8n: $N8N_PASS"
echo "JWT Secret: $JWT_SECRET"
echo "Session Secret: $SESSION_SECRET"
```

#### Step 3: Update .env File
```bash
nano .env
```

Replace the following variables with generated passwords:
```bash
CLICKHOUSE_PASSWORD=<CLICKHOUSE_PASS>
GF_SECURITY_ADMIN_PASSWORD=<GRAFANA_PASS>
N8N_BASIC_AUTH_PASSWORD=<N8N_PASS>
JWT_SECRET=<JWT_SECRET>
SESSION_SECRET=<SESSION_SECRET>
```

#### Step 4: Change Web UI Password
1. Login to Web UI: http://localhost/ui/
2. Use your current admin credentials
3. Navigate to **Settings** (user icon in top-right)
4. Click **Change Password**
5. Enter a strong password (minimum 8 characters)
6. Save changes

#### Step 5: Restart Services
```bash
docker-compose up -d
```

#### Step 6: Verify Password Changes
```bash
# Test ClickHouse with new password
curl -u admin:<CLICKHOUSE_PASS> http://localhost:8123/ping

# Test Grafana with new password
curl -u admin:<GRAFANA_PASS> http://localhost:3001/api/health

# Login to Web UI with new password
```

## 🔐 Authentication & Authorization

### JWT Token-Based Authentication

Vigil Guard uses JSON Web Tokens (JWT) for session management:

- **Token Storage**: localStorage in the browser
- **Token Lifespan**: 24 hours (configurable via `JWT_SECRET` in `.env`)
- **Token Format**: `Bearer <token>` in `Authorization` header
- **Auto-refresh**: Not implemented (users must re-login after expiration)

### Webhook Authentication

Vigil Guard uses Header Authentication to secure the n8n webhook endpoint.

| Property | Value |
|----------|-------|
| Header Name | `X-Vigil-Auth` |
| Token Location | `.env` → `N8N_WEBHOOK_AUTH_TOKEN` |
| Configuration | Manual in n8n Webhook node |

See [WEBHOOK_SECURITY.md](./WEBHOOK_SECURITY.md) for detailed configuration instructions.

### Role-Based Access Control (RBAC)

The system supports granular permissions:

| Permission | Description | Access Level |
|------------|-------------|--------------|
| `can_view_monitoring` | Access to monitoring dashboard | Read-only |
| `can_view_configuration` | Configuration editing access | Read/Write |
| `can_manage_users` | User administration access | Full control |

### User Management

#### Default Admin Account
- **Username**: `admin`
- **Password**: Auto-generated 32-character random password (displayed during `install.sh`)
- **Email**: `admin@vigilguard.local`
- **Permissions**: All permissions enabled
- **Database**: SQLite at `/data/users.db`
- **First Login**:
  1. Use password displayed during installation (also in `.env` as `WEB_UI_ADMIN_PASSWORD`)
  2. Login at http://localhost/ui with `admin/<password-from-install>`
  3. System will **force password change** before granting access
  4. Choose a strong new password (minimum 8 characters, 12+ recommended)

#### Creating Additional Users

1. Login as admin
2. Navigate to **Administration** → **User Management**
3. Click **Create User**
4. Fill in details:
   - Username (alphanumeric, 3-20 characters)
   - Email (valid email format)
   - Password (minimum 8 characters)
   - Role: `admin` or `user`
   - Permissions: Select appropriate checkboxes
5. Click **Save**

#### Password Security
- **Hashing**: Bcrypt with 12 rounds
- **Minimum length**: 8 characters
- **Force password change**: Admin can require password reset on next login
- **Password validation**: No special character requirements (but recommended)

### Last Admin Protection

**CRITICAL SAFETY FEATURE:**

The system prevents removing the last user with `can_manage_users` permission. This ensures:
- At least one administrator always exists
- No accidental lockout from user management
- System remains manageable even after configuration errors

**Example:**
```
❌ Cannot delete user "admin" - last user with user management permissions
✅ Create another admin user first, then delete this account
```

## 🛡️ Security Features

### 1. Path Traversal Protection

Backend validates all filenames to prevent directory traversal attacks:

```typescript
// In backend/src/fileOps.ts
const SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

if (!SAFE_FILENAME_PATTERN.test(filename)) {
  throw new Error('Invalid filename - only alphanumeric, underscore, dot, and hyphen allowed');
}
```

**Protected against:**
- `../../../etc/passwd`
- `..%2F..%2Fetc%2Fpasswd`
- `....//....//etc/passwd`

### 2. ETag-Based Concurrency Control

Prevents configuration conflicts when multiple users edit simultaneously:

```bash
# Client must send current ETag in If-Match header
curl -X POST http://localhost:8787/api/save \
  -H "Content-Type: application/json" \
  -H 'If-Match: "74bdbf1d"' \
  -d '{"changes": [...]}'
```

**Conflict Response** (409):
```json
{
  "error": "File changed on disk",
  "expected": "74bdbf1d",
  "actual": "27ce901a"
}
```

### 3. Secret Masking

Sensitive configuration values are masked in the UI:

```typescript
// Example: API key
{
  "name": "API_KEY",
  "value": "a***z",  // Masked: actual value "abcdefghijklmnopqrstuvwxyz"
  "secret": true
}
```

**Masking Rules:**
- Values ≤3 characters: `***`
- Values >3 characters: `first_char***last_char`
- Applies to: API keys, passwords, JWT secrets

### 4. Atomic File Operations

Configuration changes use atomic write operations:

1. Write new content to `.tmp` file
2. Rename `.tmp` to target filename (POSIX atomic operation)
3. No partial writes or corruption risk

### 5. CORS Protection

Backend restricts cross-origin requests:

```typescript
app.use(cors({
  origin: [/^http:\/\/localhost(:\d+)?$/],  // Only localhost allowed
  credentials: true                          // Enable cookies/JWT
}));
```

**Allowed origins:**
- `http://localhost:5173` (frontend dev)
- `http://localhost:8787` (backend)
- `http://localhost` (Caddy proxy)

### 6. Audit Logging

Complete change history maintained in `audit.log`:

```
[2025-10-14T14:05:30.123Z] User: admin | Action: FILE_UPLOAD | File: thresholds.config.json | Size: 245 bytes
[2025-10-14T14:06:12.456Z] User: admin | Action: CONFIG_UPDATE | Variable: CRITICAL_THRESHOLD | Old: 85 | New: 90
```

**Logged events:**
- Configuration changes
- File uploads/downloads
- User login/logout
- Permission changes
- Password changes

## 🚨 Threat Model

### Assets Protected

1. **Configuration Files** - Detection rules, thresholds, allowlists
2. **User Credentials** - Admin and user accounts
3. **System Logs** - Event history, audit trails
4. **JWT Secrets** - Authentication tokens
5. **ClickHouse Data** - Analytics and metrics

### Attack Vectors & Mitigations

| Threat | Risk | Mitigation |
|--------|------|------------|
| **Default credentials** | MEDIUM | All passwords auto-generated with crypto.randomBytes(); Web UI forces password change on first login |
| **SQL Injection** | HIGH | Parameterized queries with better-sqlite3 |
| **Path Traversal** | HIGH | Filename validation, whitelist pattern |
| **XSS** | MEDIUM | React automatic escaping, CSP headers |
| **CSRF** | MEDIUM | SameSite cookies, JWT tokens |
| **Concurrent edits** | LOW | ETag validation, atomic writes |
| **Session hijacking** | MEDIUM | httpOnly cookies, secure flag in production |

## 🔒 Production Hardening

### 1. Enable HTTPS

Update Caddy configuration for SSL:

```caddyfile
# services/proxy/Caddyfile
yourdomain.com {
    reverse_proxy /ui/* web-ui-frontend:80 {
        header_up Host {http.reverse_proxy.upstream.hostport}
    }
    reverse_proxy /n8n/* n8n:5678
    reverse_proxy /grafana/* grafana:3000
}
```

### 2. Restrict Network Access

Bind services to localhost only in production:

```yaml
# docker-compose.yml
services:
  web-ui-backend:
    ports:
      - "127.0.0.1:8787:8787"  # Only localhost
  clickhouse:
    ports:
      - "127.0.0.1:8123:8123"  # Only localhost
```

### 3. Firewall Configuration

```bash
# Allow only necessary ports
ufw allow 80/tcp   # HTTP (Caddy)
ufw allow 443/tcp  # HTTPS (Caddy)
ufw deny 8787/tcp  # Block direct backend access
ufw deny 8123/tcp  # Block direct ClickHouse access
ufw enable
```

### 4. Docker Image Security & Version Pinning

Vigil Guard uses SHA256 digest pinning for all Docker images to prevent supply chain attacks. This ensures containers are built from verified, immutable image versions.

#### Current Pinned Versions (as of 2025-10-18)

```yaml
# docker-compose.yml
clickhouse:
  image: clickhouse/clickhouse-server:24.1@sha256:44caeed7c81f...
grafana:
  image: grafana/grafana:latest@sha256:74144189b38447f...
n8n:
  image: n8nio/n8n:latest@sha256:fa410b71ccb5dde...
caddy:
  image: caddy:2-alpine@sha256:953131cfea8e12b...
```

#### Version Pin Maintenance Schedule

**Monthly Review** (1st of each month):
1. Check for new image releases:
   ```bash
   # Pull latest tags to see new versions
   docker pull clickhouse/clickhouse-server:latest
   docker pull grafana/grafana:latest
   docker pull n8nio/n8n:latest
   docker pull caddy:2-alpine
   ```

2. Get new SHA256 digests:
   ```bash
   # Inspect image to get digest
   docker inspect --format='{{index .RepoDigests 0}}' clickhouse/clickhouse-server:latest
   ```

3. Test new versions in development:
   ```bash
   # Update docker-compose.yml with new SHA256 digests
   # Test all services
   ./scripts/status.sh
   ```

4. Update production after 1 week of dev testing

**Immediate Security Updates**:

When critical vulnerabilities are announced (CVEs):
1. Check if pinned versions are affected:
   ```bash
   # Check image vulnerability scan
   docker scout cves clickhouse/clickhouse-server@sha256:44caeed7c81f...
   ```

2. Update docker-compose.yml with patched image digest
3. Deploy immediately to production:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

#### Version Pin Expiration Guidelines

| Component | Update Frequency | Reason |
|-----------|------------------|--------|
| **ClickHouse** | Monthly (minor versions) | New features, performance improvements |
| **Grafana** | Monthly | Security patches, dashboard improvements |
| **n8n** | Bi-weekly | Workflow engine updates, bug fixes |
| **Caddy** | Quarterly | Stable reverse proxy, infrequent updates |

**Signs a pin is outdated** (update immediately):
- ⚠️ Image > 6 months old
- ⚠️ Known CVE affecting current version
- ⚠️ Upstream project marks version as deprecated
- ⚠️ Breaking bugs discovered in community

#### How to Update Pinned Versions

```bash
# 1. Pull latest version
docker pull grafana/grafana:latest

# 2. Get SHA256 digest
DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' grafana/grafana:latest)
echo $DIGEST
# Output: grafana/grafana:latest@sha256:NEW_HASH_HERE

# 3. Update docker-compose.yml
# Replace old SHA256 with new one

# 4. Test in development
docker-compose down
docker-compose up -d
./scripts/status.sh

# 5. Verify all services healthy
docker ps
curl http://localhost:3001/api/health

# 6. Document change in git commit
git add docker-compose.yml
git commit -m "chore(docker): Update Grafana to sha256:NEW_HASH (version X.Y.Z)"
```

#### Automated Version Tracking (Optional)

Set up monthly GitHub Actions workflow:

```yaml
# .github/workflows/check-docker-versions.yml
name: Check Docker Image Updates
on:
  schedule:
    - cron: '0 0 1 * *'  # 1st of each month
jobs:
  check-updates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check for new images
        run: |
          docker pull clickhouse/clickhouse-server:latest
          docker pull grafana/grafana:latest
          # Create issue if new versions found
```

### 5. Regular Security Updates

```bash
# Update npm dependencies
npm update

# Check for vulnerabilities
npm audit

# Review security advisories
# - ClickHouse: https://github.com/ClickHouse/ClickHouse/security/advisories
# - Grafana: https://grafana.com/security
# - n8n: https://n8n.io/security
```

### 6. Monitoring & Alerting

Enable audit log monitoring:

```bash
# Review audit logs regularly
tail -f vigil_data/web-ui/audit.log

# Check for suspicious activities:
# - Multiple failed login attempts
# - Unexpected configuration changes
# - Access from unknown IPs
```

## 📋 Security Checklist

### Installation
- [ ] Saved auto-generated passwords (ClickHouse, Grafana, Web UI) displayed during `./install.sh` execution to secure password manager
- [ ] Verified auto-generated passwords work for Grafana and ClickHouse
- [ ] **CRITICAL**: Saved Web UI admin password from `install.sh` output (also in `.env` as `WEB_UI_ADMIN_PASSWORD`)
- [ ] Completed forced password change on first Web UI login
- [ ] Created additional admin user with strong password (optional)

### Production Deployment
- [ ] Configured HTTPS for production
- [ ] Restricted network access (firewall rules)
- [ ] Bound services to localhost only
- [ ] Documented passwords in secure password manager
- [ ] Setup regular security update schedule
- [ ] Enabled audit log monitoring
- [ ] Configured backup strategy
- [ ] Tested disaster recovery procedure

### Ongoing Operations
- [ ] Review audit logs weekly
- [ ] Update Docker images monthly
- [ ] Rotate JWT_SECRET every 6 months
- [ ] Review user permissions quarterly
- [ ] Test backup restoration quarterly

## 🆘 Security Incident Response

### Suspected Breach

1. **Immediate Actions**:
   ```bash
   # Stop all services
   docker-compose down

   # Review audit logs
   cat vigil_data/web-ui/audit.log

   # Check user database for unauthorized accounts
   sqlite3 vigil_data/web-ui/users.db "SELECT * FROM users;"
   ```

2. **Change All Credentials**:
   - Update `.env` with new passwords
   - Reset all user passwords via Web UI
   - Regenerate JWT_SECRET

3. **Restore from Backup** (if compromised):
   ```bash
   # Restore configuration from backup
   cp services/workflow/config/*.bak services/workflow/config/

   # Verify integrity
   ./scripts/status.sh
   ```

### Lost Admin Access

If you lose admin credentials:

**Option 1: Check your password manager**
```bash
# If you saved credentials during installation
# Retrieve from your secure password manager
```

**Option 2: Reset via database**
```bash
# Generate new password hash using Node.js
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('new_password', 12, (err, hash) => console.log(hash));"

# Update database
sqlite3 vigil_data/web-ui/users.db
```

```sql
-- Use the generated hash from above
UPDATE users
SET password_hash = '$2b$12$new_hash_here'
WHERE username = 'admin';
```

**Option 3: Re-run installation**
```bash
# WARNING: This will regenerate ALL credentials
docker-compose down
rm .env
cp config/.env.example .env
./install.sh
```

## 📚 Additional Resources

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **Bcrypt Best Practices**: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- **JWT Security**: https://jwt.io/introduction
- **Docker Security**: https://docs.docker.com/engine/security/

---

## 🔗 Related Documentation

- [Installation Guide](INSTALLATION.md) - Setup instructions
- [Authentication Guide](AUTHENTICATION.md) - User management details
- [Configuration Reference](CONFIGURATION.md) - Security policy configuration
- [API Documentation](API.md) - API endpoint security

**Remember:** Security is an ongoing process, not a one-time setup!
