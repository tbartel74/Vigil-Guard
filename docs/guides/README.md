# Vigil Guard User Guides

<!-- GUI-HELP: Navigation hub for all user documentation -->
<!-- GUI-SECTION: guides -->

**Version:** 2.0.0 | **Last Updated:** 2025-11-28

---

## Quick Navigation

| Guide | Description | Audience |
|-------|-------------|----------|
| [Dashboard & Monitoring](dashboard.md) | Real-time analytics, Grafana panels | All users |
| [Investigation](investigation.md) | Prompt search, threat analysis | Security analysts |
| [Configuration](configuration.md) | Detection rules, thresholds | Administrators |
| [Administration](administration.md) | User management, RBAC | Super admins |
| [Settings](settings.md) | Preferences, version history | All users |

---

## User Roles

| Role | Permissions | Access |
|------|-------------|--------|
| Standard User | `can_view_monitoring` | Dashboard, Investigation |
| Administrator | `can_view_configuration` | + Configuration, File Manager |
| Super Admin | `can_manage_users` | + User Administration |

---

## Getting Started

### First Login

1. Open: `http://localhost/ui`
2. Get admin password:
   ```bash
   docker logs vigil-web-ui-backend | grep "Password:"
   ```
3. Login with `admin` / `[password]`
4. **Change password** when prompted (required on first login)

### Interface Overview

```
┌─────────────────────────────────────────────────────┐
│  Top Bar: User info │ Prompt Guard status │ Logout │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Sidebar  │           Main Content Area              │
│          │                                          │
│ • Monitor│     (Active section content)             │
│ • Config │                                          │
│ • Admin  │                                          │
│ • Settings                                          │
│          │                                          │
├──────────┴──────────────────────────────────────────┤
│  Footer: Version 2.0.0 │ Built with Llama           │
└─────────────────────────────────────────────────────┘
```

---

## Common Tasks

| Task | Guide | Section |
|------|-------|---------|
| View threat analytics | [Dashboard](dashboard.md) | Grafana Panels |
| Search prompts by text | [Investigation](investigation.md) | Text Search |
| Analyze detection decision | [Investigation](investigation.md) | Detail View |
| Change detection thresholds | [Configuration](configuration.md) | Detection & Sensitivity |
| Add user | [Administration](administration.md) | User Management |
| View config history | [Settings](settings.md) | Version History |

---

## Screenshots Reference

| Screen | Location |
|--------|----------|
| Arbiter Configuration | `docs/pic/Arbiter-Configuration-dashboard.png` |
| Investigation Panel | `docs/pic/Investigation.png` |
| Investigation Details | `docs/pic/Investigation-details.png` |
| Monitoring Dashboard | `docs/pic/Monitoring-panel.png` |
| Data Retention Config | `docs/pic/data-retention-config.png` |

---

**Full documentation:** [docs/README.md](../README.md)
