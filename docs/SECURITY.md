# Security Guide

> **Comprehensive security practices and guidelines for Vigil Guard deployment**

## ⚠️ CRITICAL: Default Credentials Policy

**Vigil Guard ships with unified default credentials for quick testing and development:**

| Service | Username | Password | Port |
|---------|----------|----------|------|
| **Web UI** | `admin` | `admin123` | 5173 |
| **Grafana** | `admin` | `admin123` | 3001 |
| **ClickHouse** | `admin` | `admin123` | 8123 |
| **n8n** | (create on first access) | - | 5678 |

### Security Recommendations

1. **Development/Testing Environment**: Default credentials are acceptable
2. **Production Deployment**:
   - ⚠️ **Change ALL passwords immediately after installation**
   - ⚠️ **Update credentials in `.env` file before running `install.sh`**
   - ⚠️ **Configure strong JWT_SECRET (32+ characters)**
   - ⚠️ **Enable HTTPS via Caddy reverse proxy**
   - ⚠️ **Restrict network access to services (firewall rules)**

### How to Change Credentials

#### Step 1: Stop All Services
```bash
docker-compose down
```

#### Step 2: Update .env File
```bash
nano .env
```

Edit the following variables:
```bash
# CRITICAL: Change these passwords!
CLICKHOUSE_PASSWORD=admin123          # ← Change this
GF_SECURITY_ADMIN_PASSWORD=admin123   # ← Change this
N8N_BASIC_AUTH_PASSWORD=admin123      # ← Change this
JWT_SECRET=your-secret-here           # ← Change this (32+ characters)
```

**Generate secure passwords:**
```bash
# Generate a secure random password (32 characters)
openssl rand -base64 32 | tr -d '/+=' | head -c 32
```

#### Step 3: Change Web UI Password
1. Login to Web UI: http://localhost:5173/ui
2. Use default credentials: `admin` / `admin123`
3. Navigate to **Settings** (user icon in top-right)
4. Click **Change Password**
5. Enter a strong password (minimum 8 characters)
6. Save changes

#### Step 4: Restart Services
```bash
docker-compose up -d
```

#### Step 5: Verify Password Changes
```bash
# Test ClickHouse with new password
curl -u admin:<NEW_PASSWORD> http://localhost:8123/ping

# Test Grafana with new password
curl -u admin:<NEW_PASSWORD> http://localhost:3001/api/health

# Login to Web UI with new password
# Should no longer accept admin123
```

## 🔐 Authentication & Authorization

### JWT Token-Based Authentication

Vigil Guard uses JSON Web Tokens (JWT) for session management:

- **Token Storage**: localStorage in the browser
- **Token Lifespan**: 24 hours (configurable via `JWT_SECRET` in `.env`)
- **Token Format**: `Bearer <token>` in `Authorization` header
- **Auto-refresh**: Not implemented (users must re-login after expiration)

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
- **Password**: `admin123` (change immediately!)
- **Permissions**: All permissions enabled
- **Database**: SQLite at `/data/users.db`

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
| **Default credentials** | CRITICAL | Change immediately after installation |
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

### 4. Regular Security Updates

```bash
# Update Docker images monthly
docker-compose pull
docker-compose up -d

# Update npm dependencies
npm update

# Check for vulnerabilities
npm audit
```

### 5. Monitoring & Alerting

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
- [ ] Changed all passwords in .env file
- [ ] Changed Web UI admin password
- [ ] Verified new passwords work
- [ ] Generated strong JWT_SECRET (32+ characters)

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

```bash
# Reset admin password via database
sqlite3 vigil_data/web-ui/users.db
```

```sql
-- Generate new password hash (bcrypt, 12 rounds)
-- Use online bcrypt generator or Node.js script

UPDATE users
SET password_hash = '$2b$12$new_hash_here'
WHERE username = 'admin';
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
