# Settings & Preferences

<!-- GUI-HELP: User preferences, timezone, and password management -->
<!-- GUI-SECTION: settings -->

**Version:** 2.0.0 | **Last Updated:** 2025-11-28

---

## Overview

Personal settings and preferences for your Vigil Guard account.

**Location:** Settings (sidebar)
**Available to:** All authenticated users

---

## User Information

**Displays (read-only):**
| Field | Description |
|-------|-------------|
| Username | Your account identifier |
| Email | Contact address |
| Role | admin / user |
| Permissions | Granted access levels |

---

## Timezone Preference

**Purpose:** Display timestamps in your local timezone

**Options:** All IANA timezone identifiers
- `America/New_York`
- `Europe/London`
- `Europe/Warsaw`
- `UTC`
- etc.

**Impact:**
- Investigation panel timestamps
- Audit log timestamps
- Grafana dashboard times
- Export file timestamps

**How to change:**
1. Select timezone from dropdown
2. Click **"Save Settings"**
3. Refresh page to apply

---

## Password Change

### Requirements
| Field | Requirement |
|-------|-------------|
| Current Password | For verification |
| New Password | Minimum 8 characters |
| Confirm Password | Must match |

### Security Features
- Bcrypt hashing (12 rounds)
- Current password verification
- Password strength validation

### Steps
1. Click **"Change Password"** button
2. Enter current password
3. Enter new password twice
4. Click **"Update Password"**
5. Success message confirms change

---

## Session Management

### Active Session
- JWT token valid for 24 hours
- Auto-refresh during activity
- Stored in localStorage

### Logout
**Location:** Top-right user dropdown

**Effect:**
- Invalidates JWT token
- Clears localStorage
- Redirects to login page

---

## First Login

On first login with initial admin password:

1. System prompts for password change
2. Enter new password (min 8 chars)
3. Confirm new password
4. Submit to complete login

**Initial password is:**
```bash
docker logs vigil-web-ui-backend | grep "Password:"
```

---

## Version History Access

**Location:** Configuration section → "Version History" button

Even from Settings, you can navigate to Configuration to:
- View configuration change history
- See who made changes and when
- Rollback to previous versions (if authorized)

---

## Accessibility

### Theme
- Dark mode support (follows system preference)
- High contrast labels
- Keyboard navigation support

### Shortcuts
| Key | Action |
|-----|--------|
| ESC | Close modals |
| Tab | Navigate form fields |
| Enter | Submit forms |

---

## Troubleshooting

### Session Expired
**Symptom:** Redirected to login unexpectedly

**Solution:**
1. Log in again
2. Check if multiple tabs are open
3. Verify clock is correct (JWT time validation)

### Timezone Not Applying
**Symptom:** Timestamps show wrong timezone

**Solution:**
1. Save settings again
2. Hard refresh page (Ctrl+Shift+R)
3. Clear browser cache if needed

### Password Change Fails
**Symptom:** Error when changing password

**Solutions:**
1. Verify current password is correct
2. New password must be 8+ characters
3. Confirm password must match exactly
4. Check for special character issues

---

**Related:** [Administration](administration.md) | [Dashboard](dashboard.md)
