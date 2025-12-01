# User Administration

<!-- GUI-HELP: User management and role-based access control -->
<!-- GUI-SECTION: administration -->

**Version:** 2.0.0 | **Last Updated:** 2025-11-28

---

## Overview

Create, edit, and manage user accounts with role-based access control.

**Location:** Administration (sidebar)
**Permission:** `can_manage_users`

---

## User List

| Column | Description |
|--------|-------------|
| Username | Unique identifier |
| Email | Contact address |
| Role | admin / user |
| Active Status | Active / Inactive |
| Permissions | Permission badges |
| Last Login | Timestamp |
| Actions | Edit, Delete, Toggle |

---

## Creating Users

1. Click **"Create New User"** button
2. Fill in form:
   - Username (required, unique)
   - Email (required, valid format)
   - Password (required, min 8 characters)
   - Confirm Password
   - Role (admin/user)
3. Set permissions:
   - Can view monitoring
   - Can view configuration
   - Can manage users
4. Optional:
   - Force password change on next login
   - Account active status
   - Timezone preference
5. Click **"Create User"**

---

## Editing Users

1. Click **"Edit"** on user row
2. Modify fields (password optional)
3. Update permissions
4. Click **"Save Changes"**

---

## User Actions

### Toggle Active/Inactive
- Disable access without deleting
- Can be re-enabled later
- Inactive users cannot log in

### Force Password Change
- Requires password change on next login
- Use for security compliance

### Delete User
- Permanently removes account
- Cannot be undone
- **Protection:** Cannot delete last admin

---

## Permission Matrix

| Permission | Monitoring | Config | Files | Users | Settings |
|-----------|-----------|--------|-------|-------|----------|
| `can_view_monitoring` | Yes | No | No | No | Yes |
| `can_view_configuration` | Yes | Yes | Yes | No | Yes |
| `can_manage_users` | Yes | Yes | Yes | Yes | Yes |

---

## Role Guidelines

### Standard User
- Permissions: `can_view_monitoring`
- Access: Dashboard, Investigation, Settings
- Use for: Security analysts, SOC operators

### Administrator
- Permissions: `can_view_monitoring` + `can_view_configuration`
- Access: + Configuration, File Manager
- Use for: Security engineers, DevOps

### Super Admin
- Permissions: All three
- Access: Full system access
- Use for: System administrators

---

## Security Features

### Password Policy
- Minimum 8 characters
- Bcrypt hashing (12 rounds)
- Force change option

### Account Security
- JWT token authentication (24h expiration)
- Rate limiting (5 attempts / 15 minutes)
- Session invalidation on logout

### Audit Trail
- All user changes logged
- Timestamp + actor recorded
- Configuration audit in `audit.log`

---

## Best Practices

1. **Principle of Least Privilege**
   - Grant minimum necessary permissions
   - Review permissions quarterly

2. **Account Hygiene**
   - Disable unused accounts (don't delete)
   - Remove departed employees promptly
   - Use unique usernames (avoid generic "admin")

3. **Password Security**
   - Force password change for new users
   - Require change after suspected compromise
   - Don't share accounts

4. **Admin Protection**
   - Always maintain at least 2 admin accounts
   - Document admin account recovery procedure

---

**Related:** [Configuration](configuration.md) | [Settings](settings.md)
