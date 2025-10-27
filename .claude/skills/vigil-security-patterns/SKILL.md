---
name: vigil-security-patterns
description: Security best practices and patterns for Vigil Guard development. Use when implementing authentication, handling secrets, validating input, preventing injection attacks, managing CORS, or ensuring secure coding practices.
version: 1.0.0
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# Vigil Guard Security Patterns

## Overview
Comprehensive security best practices for developing and maintaining Vigil Guard's security-critical codebase.

## When to Use This Skill
- Implementing authentication flows
- Managing secrets and credentials
- Validating user input
- Preventing injection attacks
- Configuring CORS policies
- Handling password hashing
- Implementing RBAC permissions
- Secure session management
- Code review for security issues

## Authentication Security

### JWT Token Management
Best practices for secure token handling in authentication flows.

### Password Security
Always use bcrypt with 12 rounds for password hashing. Never log or store plaintext passwords.

### Permission Checks
Server-side permission validation is required. Client-side checks can be bypassed.

## Input Validation

### Path Traversal Prevention
Whitelist allowed filenames and sanitize all user input.

### SQL Injection Prevention
Always use parameterized queries, never string concatenation.

### XSS Prevention
React auto-escapes by default. Use DOMPurify for HTML sanitization.

## Secret Management

### Environment Variables
Store secrets in .env file, auto-generate during installation using openssl.

**Critical Security Requirement:**
- Secrets MUST be set in `.env` file (no defaults in docker-compose.yml)
- Application fails immediately if secrets missing (fail-secure design)
- Minimum length: 32 characters (JWT_SECRET), 48 characters (SESSION_SECRET)
- Auto-generated using: `openssl rand -base64 <length>`

### Automatic Password Rotation Security

**⚠️ CRITICAL SECURITY FEATURE** (implemented in PR #28)

When `install.sh` generates new passwords, it **automatically removes old ClickHouse data volumes** to prevent password mismatches.

**Password Rotation Workflow:**

```bash
# 1. Detection Phase
install.sh detects if:
  - .env file doesn't exist (fresh install)
  - Default passwords detected (admin123, etc.)
  - Missing SESSION_SECRET

# 2. Password Generation Phase
  - Generates 32+ character random passwords using openssl rand
  - Updates .env file with new credentials
  - Updates Grafana datasource config template

# 3. Automatic Cleanup Phase (CRITICAL!)
  # Verifies Docker daemon accessible
  docker info >/dev/null 2>&1 || exit 1

  # Stops ClickHouse container if running
  docker-compose stop clickhouse

  # Removes container
  docker-compose rm -f clickhouse

  # Removes old volume data (prevents password conflicts)
  if ! rm -rf vigil_data/clickhouse 2>&1; then
    echo "CRITICAL: Password Rotation Cannot Complete"
    exit 1
  fi

  # Verifies deletion succeeded (catches silent failures)
  [ -d vigil_data/clickhouse ] && exit 1

# 4. Clean Start Phase
  - ClickHouse starts with clean, empty volume
  - New password is used from the start
  - No old credentials remain in any cache or volume
  - Init scripts create fresh database schema
```

**Why this matters:**
- ClickHouse stores user credentials in volume data (not config files)
- Updating `.env` alone doesn't change container's stored password
- Old volume + new password = authentication failure
- Automatic cleanup prevents this security vulnerability

**Implementation:**
- `install.sh:335-399` - Password rotation cleanup
- `install.sh:213-308` - Fresh install cleanup with user confirmation
- `docs/SECURITY.md` - Full documentation

**User Confirmation (Fresh Install Only):**
When `.env` missing but volume exists, user gets interactive prompt:
```
Remove existing ClickHouse volume? (Y/n):
  Y - Clean installation with new passwords (RECOMMENDED)
  N - Keep volume (WARNING: will cause auth failures!)
```

**Error Handling:**
All `rm -rf` operations include:
1. Docker daemon verification
2. Exit code checking
3. Deletion verification (prevents silent failures)
4. Clear error messages with recovery instructions

### Secret Masking in UI
Display masked values showing only first and last character (e.g., `a***z` for `admin123`).

## CORS Configuration

Restrict origin to localhost in development, specific domains in production.

## Audit Logging

Track all config changes and authentication events with timestamps and usernames.

## Rate Limiting

Implement rate limiting on authentication endpoints to prevent brute force attacks.

## ETag Concurrency Control

Use MD5 hash of content as ETag to prevent concurrent edit conflicts.

## Session Security

Implement session timeouts and logout on inactivity.

## RBAC Implementation

Granular permissions with last admin protection to prevent lockout.

## Common Vulnerabilities

OWASP Top 10 coverage with mitigations for broken access control, cryptographic failures, and injection attacks.

## Code Review Checklist

- No hardcoded secrets
- Input validation present
- SQL queries parameterized
- Permissions checked server-side
- Passwords hashed with bcrypt
- CORS configured properly
- Audit logging implemented
- ETag used for concurrent edits

## Related Skills
- `react-tailwind-vigil-ui` - Frontend security patterns
- `n8n-vigil-workflow` - Sanitization implementation
- `docker-vigil-orchestration` - Environment variable management

## References
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Security docs: `docs/SECURITY.md`
- Auth docs: `docs/AUTHENTICATION.md`
