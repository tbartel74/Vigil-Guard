# Authentication & User Management

## Overview

Vigil Guard implements a comprehensive Role-Based Access Control (RBAC) system with JWT authentication, local SQLite database, and granular permissions.

## Architecture

### Components

1. **Authentication System**
   - JWT (JSON Web Tokens) for session management
   - Bcrypt password hashing (12 rounds)
   - Token stored in localStorage
   - Automatic token validation on protected routes

2. **User Database**
   - SQLite database with `better-sqlite3`
   - Automatic schema migration support
   - Default admin user created on first run
   - User data stored in `/data/users.db`

3. **Authorization Middleware**
   - `authenticate` - Validates JWT tokens
   - `requireMonitoringAccess` - Checks monitoring permission
   - `requireConfigurationAccess` - Checks configuration permission
   - `requireUserManagementAccess` - Checks user management permission

## User Permissions

### Permission Types

| Permission | Description | Default Admin | Default User |
|-----------|-------------|---------------|--------------|
| `can_view_monitoring` | Access to monitoring dashboard and analytics | ✓ | ✓ |
| `can_view_configuration` | Ability to view and edit system configuration | ✓ | ✗ |
| `can_manage_users` | User administration (create, edit, delete users) | ✓ | ✗ |

### Permission Rules

- **At least one active user** must have `can_manage_users` permission
- Users cannot remove their own `can_manage_users` permission if they are the last admin
- Admin users have all permissions by default
- Regular users have monitoring access only by default

## User Roles

### Admin Role
- Full access to all system features
- User management capabilities
- Configuration access
- Monitoring access
- Cannot be downgraded if last remaining admin

### User Role
- Limited access based on assigned permissions
- Monitoring access by default
- No configuration or user management access by default
- Can be granted additional permissions by administrators

## User Management

### Creating Users

Administrators can create new users through the Administration panel:

```typescript
POST /api/auth/users
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "secure_password",
  "role": "user",
  "can_view_monitoring": true,
  "can_view_configuration": false,
  "can_manage_users": false
}
```

### User Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `username` | string | Yes | Unique username (3-50 characters) |
| `email` | string | Yes | User email address |
| `password` | string | Yes | User password (min 8 characters) |
| `role` | string | Yes | Either "admin" or "user" |
| `can_view_monitoring` | boolean | No | Monitoring access permission |
| `can_view_configuration` | boolean | No | Configuration access permission |
| `can_manage_users` | boolean | No | User management permission |
| `timezone` | string | No | User timezone (default: UTC) |
| `is_active` | boolean | No | Account active status (default: true) |
| `force_password_change` | boolean | No | Force password change on next login |

### Editing Users

```typescript
PUT /api/auth/users/:id
{
  "email": "updated@example.com",
  "can_view_configuration": true,
  "timezone": "Europe/Warsaw"
}
```

### Deleting Users

```typescript
DELETE /api/auth/users/:id
```

**Note**: Cannot delete the last active user with `can_manage_users` permission.

### Toggling User Status

```typescript
POST /api/auth/users/:id/toggle-active
```

Deactivates or reactivates a user account. Deactivated users cannot log in.

### Force Password Change

```typescript
POST /api/auth/users/:id/force-password-change
```

Requires user to change password on next login.

## Authentication API

### Login

```typescript
POST /api/auth/login
{
  "username": "admin",
  "password": "password123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "can_view_monitoring": true,
    "can_view_configuration": true,
    "can_manage_users": true,
    "timezone": "UTC"
  }
}
```

### Verify Token

```typescript
GET /api/auth/verify
Headers: Authorization: Bearer <token>

Response:
{
  "valid": true,
  "user": { ... }
}
```

### Logout

```typescript
POST /api/auth/logout
Headers: Authorization: Bearer <token>
```

### Change Password

```typescript
POST /api/auth/change-password
{
  "current_password": "old_password",
  "new_password": "new_secure_password"
}
```

## User Settings

### Update Timezone

```typescript
PUT /api/auth/settings
{
  "timezone": "Europe/Warsaw"
}
```

Available timezones:
- UTC (default)
- Europe/Warsaw, Europe/London, Europe/Paris, Europe/Berlin
- America/New_York, America/Chicago, America/Denver, America/Los_Angeles
- Asia/Tokyo, Asia/Shanghai, Asia/Dubai
- Australia/Sydney

## Security Features

### Password Security
- Minimum 8 characters required
- Bcrypt hashing with 12 rounds
- Passwords never exposed in API responses
- Optional force password change on next login

### Token Security
- JWT tokens with configurable expiration
- Tokens validated on every protected request
- Automatic token refresh mechanism
- Secure token storage in localStorage

### Session Management
- Automatic logout on token expiration
- Manual logout clears all session data
- Invalid tokens redirect to login page

### Database Security
- SQL injection prevention via parameterized queries
- Automatic schema migrations
- Transaction support for atomic operations
- File-based SQLite database with proper permissions

## Default Credentials

On first startup, the system creates a default administrator account:

```
Username: admin
Password: admin123
Email: admin@vigil-guard.local
```

**⚠️ IMPORTANT**: Change the default password immediately after first login!

## Protected Routes

### Frontend Routes

| Route | Permission Required | Description |
|-------|-------------------|-------------|
| `/` | `can_view_monitoring` | Monitoring dashboard |
| `/config/*` | `can_view_configuration` | Configuration management |
| `/administration` | `can_manage_users` | User management |
| `/settings` | Authenticated | User settings |

### API Routes

All API routes under `/api/files`, `/api/parse`, `/api/resolve`, and `/api/save` require:
- Valid JWT token
- `can_view_configuration` permission

All API routes under `/api/auth/users` require:
- Valid JWT token
- `can_manage_users` permission

## Database Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active INTEGER DEFAULT 1,
  can_view_monitoring INTEGER DEFAULT 1,
  can_view_configuration INTEGER DEFAULT 0,
  can_manage_users INTEGER DEFAULT 0,
  force_password_change INTEGER DEFAULT 0,
  timezone TEXT DEFAULT 'UTC'
);

CREATE INDEX idx_username ON users(username);
CREATE INDEX idx_email ON users(email);
```

## Environment Variables

```bash
# JWT secret key (required)
JWT_SECRET=your-secret-key-here

# Token expiration time (optional, default: 24h)
JWT_EXPIRES_IN=24h

# Database path (optional, default: ./data/users.db)
DATABASE_PATH=/path/to/users.db
```

## Migration Guide

### From Unauthenticated System

If upgrading from a version without authentication:

1. Database is created automatically on first backend startup
2. Default admin user is created with credentials above
3. All existing functionality remains accessible to authenticated users
4. Configure permissions for new users as needed

### Adding New Permissions

To add new permissions:

1. Add column to database schema in `database.ts`
2. Update `User` interface with new permission field
3. Add migration logic to `migrateDatabase()` function
4. Create corresponding middleware in `auth.ts`
5. Update frontend components to check new permission

## Troubleshooting

### Cannot Login

1. Check browser console for errors
2. Verify backend is running on port 8787
3. Check backend logs for authentication errors
4. Clear localStorage and try again
5. Verify credentials are correct

### Permission Denied

1. Check user permissions in Administration panel
2. Verify JWT token is valid
3. Check if user account is active
4. Confirm required permission is granted

### Last Admin Protection

If you cannot remove the last admin's user management permission:
1. Create another admin user first
2. Grant `can_manage_users` to new user
3. Then remove permission from original admin

### Database Issues

```bash
# Check database file exists
ls -la data/users.db

# Reset database (WARNING: deletes all users)
rm data/users.db
# Restart backend to recreate with default admin
```

## Best Practices

1. **Change default admin password immediately**
2. **Create separate admin accounts for each administrator**
3. **Use strong passwords** (minimum 12 characters recommended)
4. **Regularly review user permissions**
5. **Deactivate accounts instead of deleting** when possible
6. **Set appropriate timezone** for each user
7. **Use force password change** for security incidents
8. **Keep JWT_SECRET secure** and unique per environment
9. **Regular database backups** recommended
10. **Monitor last_login timestamps** for inactive accounts

## API Reference

For complete API endpoint documentation, see [API.md](./API.md).
