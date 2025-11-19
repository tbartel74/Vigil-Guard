# PII Entity Toggle Fix - Detailed Implementation Plan

**Date:** 2025-11-19
**Issue:** URL detected even when disabled in GUI
**Root Cause:** Two-source configuration inconsistency

---

## Problem Analysis

### Current Architecture (BROKEN)

```
┌─────────────────────────────────────────────────────────────┐
│                    GUI Entity Toggle                        │
│         http://localhost/ui/config/pii                      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│         Backend: piiConfigSync.ts                          │
│                                                            │
│  1. Receives enabledEntities from GUI                      │
│  2. Calls buildPiiConfUpdates(currentPiiConf, enabledSet) │
│  3. Writes TWO files:                                      │
│     - unified_config.json.pii_detection.entities           │
│     - pii.conf.rules (filtered)                            │
│     - pii.conf.__all_rules (canonical)                     │
└────────────────┬───────────────────────────────────────────┘
                 │
     ┌───────────┴────────────┐
     │                        │
     ▼                        ▼
┌─────────────┐      ┌──────────────┐
│  File 1:    │      │   File 2:    │
│ unified_    │      │   pii.conf   │
│ config.json │      │              │
│             │      │              │
│ entities:   │      │ rules: [13]  │
│ [11 types   │      │ (NO URL)     │
│  WITH URL]  │      │              │
│             │      │ __all_rules: │
│             │      │ [21 types]   │
└─────┬───────┘      └──────┬───────┘
      │                     │
      │ PRESIDIO PATH      │ REGEX PATH
      ▼                     ▼
┌──────────────────────────────────────┐
│    Workflow: PII_Redactor_v2         │
│                                      │
│  Line 577-578:                       │
│  const enabledEntities =             │
│    piiConfig.entities  ←─────────────┤ SOURCE 1: unified_config
│                                      │
│  Line 596-607:                       │
│  polishEntities = filtered           │
│  englishEntities = filtered          │
│                                      │
│  Lines 631-652: Presidio API calls   │
│  ✅ Uses filtered entities           │
│                                      │
│  Line 1042: findRegexEntities()      │
│  Line 1133: applyLegacyPiiRules()    │
│  ❌ Uses piiConf.rules  ←────────────┤ SOURCE 2: pii.conf
│                                      │
└──────────────────────────────────────┘

PROBLEM: Two sources can be INCONSISTENT!
- unified_config.json updated via GUI save
- pii.conf updated via buildPiiConfUpdates()
- BUT if sync fails or backend not rebuilt → DESYNC
```

### Observed Inconsistency

```bash
# Current State (BROKEN):
unified_config.json.pii_detection.entities: [11 types WITH URL]
pii.conf.rules: [13 entries NO URL]
pii.conf.__all_rules: [21 entries WITH URL]

# Result:
✅ Presidio: Filters to 11 entities → DETECTS URL (uses unified_config)
❌ Regex:    Uses 13 rules → NO URL rule (uses pii.conf.rules)

# Test Result:
❌ pii_types_detected: ['URL']  ← Presidio detected it!
```

---

## Root Cause Identification

### Why Inconsistency Happened

**Hypothesis 1: Backend Not Rebuilt**
- User disabled URL → Backend v1 (without two-tier storage) didn't save properly
- Backend rebuilt with v2 (two-tier storage) → pii.conf updated
- User re-enabled URL → Backend v2 saved to unified_config.json
- BUT backend v2 buildPiiConfUpdates() NEVER ran because...

**Hypothesis 2: buildPiiConfUpdates() Logic Error**
Check line 196-255 in piiConfigSync.ts:

```typescript
function buildPiiConfUpdates(currentPiiConf: any, enabledSet: Set<string>) {
  // Lines 221-226: Bootstrap canonical storage
  const canonicalRules = Array.isArray(currentPiiConf.__all_rules)
    ? currentPiiConf.__all_rules
    : existingRules;  // ← First run copies current rules

  // Lines 229-232: Filter canonical rules
  const filteredRules = canonicalRules.filter((rule) => {
    if (!rule?.target_entity) return true;
    return enabledSet.has(rule.target_entity);  // ← FILTERS based on enabledSet
  });

  // Lines 249-254: Return updates
  return {
    __all_rules: canonicalRules,  // ← Canonical (complete)
    __all_order: canonicalOrder,
    rules: filteredRules,         // ← Active (filtered)
    order: filteredOrder
  };
}
```

**Code looks CORRECT!** So why didn't it work?

**Hypothesis 3: Workflow Reads Stale Config**
- Workflow reads config via Config Loader node
- Config Loader reads from `/home/node/config/pii.conf`
- If backend writes to `/config/pii.conf` but workflow mounts different path → STALE

Let's verify mount paths:

```bash
# Backend container:
docker exec vigil-web-ui-backend ls -la /config/

# n8n container:
docker exec vigil-n8n ls -la /home/node/config/

# Are they the SAME volume?
docker inspect vigil-web-ui-backend | grep -A 10 Mounts
docker inspect vigil-n8n | grep -A 10 Mounts
```

---

## Solution Design

### Option 1: Single Source of Truth (RECOMMENDED)

**Make `pii.conf` the ONLY source** for enabled entities.

**Changes Required:**

1. **Backend: piiConfigSync.ts**
   - Keep writing to both files (for backward compatibility)
   - Ensure atomic write (both or neither)

2. **Workflow: PII_Redactor_v2**
   - Lines 577-578: READ from `piiConf.rules` (NOT `piiConfig.entities`)
   - Build `enabledEntities` from `piiConf.rules.map(r => r.target_entity)`
   - Use this for BOTH Presidio AND regex fallback

**Pros:**
- Single source of truth
- No risk of desync
- Regex fallback already uses pii.conf

**Cons:**
- Workflow depends on pii.conf format
- If pii.conf missing/corrupt → no PII detection

---

### Option 2: Sync on Every Workflow Execution

**Read from `unified_config.json` and ENFORCE filter on regex fallback**

**Changes Required:**

1. **Workflow: PII_Redactor_v2**
   - Keep reading `enabledEntities` from `piiConfig.entities` (line 577)
   - In `findRegexEntities()` and `applyLegacyPiiRules()`:
     - Filter `piiConf.rules` by `enabledEntities` at runtime
     - Don't trust `piiConf.rules` to be pre-filtered

**Pros:**
- Backend doesn't need to maintain pii.conf accuracy
- Workflow always respects GUI toggle

**Cons:**
- Filtering happens on every request (performance hit)
- pii.conf becomes "template" not "active config"

---

### Option 3: Validation Layer (DEFENSIVE)

**Add validation to ensure both sources match**

**Changes Required:**

1. **Workflow: PII_Redactor_v2**
   - At startup (line 529):
     ```javascript
     // Validate config consistency
     const enabledInUnified = piiConfig.entities || [];
     const enabledInPiiConf = (j.pii_conf?.rules || [])
       .map(r => r.target_entity)
       .filter((e, i, arr) => arr.indexOf(e) === i); // dedupe

     const missingInPiiConf = enabledInUnified.filter(e => !enabledInPiiConf.includes(e));
     if (missingInPiiConf.length > 0) {
       console.warn(`⚠️  Config mismatch: ${missingInPiiConf.join(', ')} enabled in GUI but missing in pii.conf`);
       // Fallback: filter piiConf.rules at runtime
     }
     ```

2. **Backend: Health Check Endpoint**
   - Add `/api/pii-detection/validate-config`
   - Compare unified_config.json vs pii.conf
   - Return warnings if inconsistent

**Pros:**
- Detects desync early
- Can auto-fix at runtime

**Cons:**
- More complex
- Doesn't prevent root cause

---

## Recommended Solution: Option 1 + Option 3

**Hybrid Approach:**

1. **Primary:** Use `pii.conf.rules` as single source (Option 1)
2. **Defensive:** Add validation layer to detect desync (Option 3)
3. **Fallback:** If validation fails, use `unified_config.json` entities

### Implementation Steps

#### Step 1: Fix Workflow (PII_Redactor_v2)

**File:** `workflows/Vigil Guard v1.8.1.json`
**Node:** `PII_Redactor_v2`
**Lines to Change:** 577-607

**Current Code (lines 577-580):**
```javascript
const enabledEntities = Array.isArray(piiConfig.entities) && piiConfig.entities.length > 0
  ? piiConfig.entities
  : null;
```

**New Code:**
```javascript
// PRIMARY SOURCE: pii.conf.rules (single source of truth)
// Extract enabled entities from pii.conf rules
let enabledEntities = null;
if (j.pii_conf && Array.isArray(j.pii_conf.rules) && j.pii_conf.rules.length > 0) {
  const rulesEntities = j.pii_conf.rules
    .map(r => r.target_entity)
    .filter(Boolean)
    .filter((e, i, arr) => arr.indexOf(e) === i); // dedupe

  enabledEntities = rulesEntities.length > 0 ? rulesEntities : null;

  console.log(`✅ Entity list source: pii.conf.rules (${rulesEntities.length} types)`);
}

// FALLBACK: If pii.conf missing/empty, use unified_config
if (!enabledEntities && Array.isArray(piiConfig.entities) && piiConfig.entities.length > 0) {
  enabledEntities = piiConfig.entities;
  console.warn(`⚠️  Fallback: Using unified_config.json entities (pii.conf unavailable)`);
}

// VALIDATION: Check for desync
if (enabledEntities && Array.isArray(piiConfig.entities) && piiConfig.entities.length > 0) {
  const unified = new Set(piiConfig.entities);
  const piiConf = new Set(enabledEntities);

  const inUnifiedOnly = piiConfig.entities.filter(e => !piiConf.has(e));
  const inPiiConfOnly = enabledEntities.filter(e => !unified.has(e));

  if (inUnifiedOnly.length > 0 || inPiiConfOnly.length > 0) {
    console.warn(`⚠️  CONFIG DESYNC DETECTED:`);
    if (inUnifiedOnly.length > 0) {
      console.warn(`   - In unified_config only: ${inUnifiedOnly.join(', ')}`);
    }
    if (inPiiConfOnly.length > 0) {
      console.warn(`   - In pii.conf only: ${inPiiConfOnly.join(', ')}`);
    }
    // Use intersection (safest approach)
    enabledEntities = piiConfig.entities.filter(e => piiConf.has(e));
    console.warn(`   → Using intersection: ${enabledEntities.length} entities`);
  }
}
```

**Lines 596-607 (entity assignment) - NO CHANGE**
```javascript
// Build entity lists for each language based on filtered sets
polishEntities = [...polishSpecificEntities, ...generalEntities];
englishEntities = [...generalEntities, 'PERSON'];

console.log(`📤 Entities to Presidio → Polish: ${polishEntities.length} types, English: ${englishEntities.length} types`);
```

#### Step 2: Verify Backend Sync (piiConfigSync.ts)

**File:** `services/web-ui/backend/src/piiConfigSync.ts`
**Function:** `buildPiiConfUpdates()` (lines 196-255)

**Verify existing code is correct:**
```typescript
// Line 229-232: Filter rules by enabledSet
const filteredRules = canonicalRules.filter((rule) => {
  if (!rule?.target_entity) return true;
  return enabledSet.has(rule.target_entity);  // ← CORRECT
});
```

**Add debug logging:**
```typescript
// After line 254 (before return):
console.log(`[buildPiiConfUpdates] Filtered ${filteredRules.length}/${canonicalRules.length} rules`);
console.log(`[buildPiiConfUpdates] Enabled entities: ${Array.from(enabledSet).join(', ')}`);
```

#### Step 3: Test Fix

1. **Disable URL in GUI:**
   ```bash
   # Navigate to http://localhost/ui/config/pii
   # Uncheck "URL"
   # Click "Save"
   ```

2. **Verify pii.conf updated:**
   ```bash
   docker exec vigil-n8n cat /home/node/config/pii.conf | python3 -c "
   import json, sys
   conf = json.load(sys.stdin)
   print('Active rules:', len(conf['rules']))
   print('Canonical rules:', len(conf['__all_rules']))
   print('URL in active:', any(r.get('target_entity') == 'URL' for r in conf['rules']))
   "
   ```

3. **Verify unified_config updated:**
   ```bash
   docker exec vigil-web-ui-backend cat /config/unified_config.json | python3 -c "
   import json, sys
   conf = json.load(sys.stdin)
   print('Entities:', len(conf['pii_detection']['entities']))
   print('URL in entities:', 'URL' in conf['pii_detection']['entities'])
   "
   ```

4. **Run regression test:**
   ```bash
   npm test -- pii-entity-toggle-regression.test.js
   ```

5. **Expected Result:**
   ```
   ✅ should NOT detect URL when entity is disabled in GUI
   ✅ should respect GUI toggle in regex fallback path
   ```

#### Step 4: Add Backend Health Check

**File:** `services/web-ui/backend/src/server.ts`
**Add new endpoint:**

```typescript
// After line 320 (after /api/pii-detection/analyze-full)

/**
 * Validate PII configuration consistency
 *
 * Checks if unified_config.json and pii.conf are in sync
 */
app.get('/api/pii-detection/validate-config', authenticateToken, async (req, res) => {
  try {
    // Read unified_config.json
    const unifiedFile = await parseFile('unified_config.json');
    const unifiedEntities = unifiedFile.parsed?.pii_detection?.entities || [];

    // Read pii.conf
    const piiConfFile = await parseFile('pii.conf');
    const piiConfRules = piiConfFile.parsed?.rules || [];
    const piiConfEntities = [...new Set(
      piiConfRules
        .map(r => r.target_entity)
        .filter(Boolean)
    )];

    // Compare
    const unified = new Set(unifiedEntities);
    const piiConf = new Set(piiConfEntities);

    const inUnifiedOnly = unifiedEntities.filter(e => !piiConf.has(e));
    const inPiiConfOnly = piiConfEntities.filter(e => !unified.has(e));

    const consistent = inUnifiedOnly.length === 0 && inPiiConfOnly.length === 0;

    res.json({
      consistent,
      unified_config: {
        count: unifiedEntities.length,
        entities: unifiedEntities
      },
      pii_conf: {
        count: piiConfEntities.length,
        entities: piiConfEntities
      },
      discrepancies: consistent ? null : {
        in_unified_only: inUnifiedOnly,
        in_pii_conf_only: inPiiConfOnly
      }
    });
  } catch (error) {
    console.error('[PII Config Validation] Error:', error);
    res.status(500).json({
      error: 'Failed to validate PII configuration',
      message: error.message
    });
  }
});
```

---

## Testing Plan

### Test Case 1: Disable URL
1. GUI: Uncheck URL → Save
2. Verify: Both files updated (unified_config + pii.conf)
3. Send: "Visit https://test.com"
4. Assert: No URL detection

### Test Case 2: Re-enable URL
1. GUI: Check URL → Save
2. Verify: Both files updated
3. Send: "Visit https://test2.com"
4. Assert: URL detected and redacted

### Test Case 3: Desync Detection
1. Manually edit unified_config.json (add URL)
2. Manually edit pii.conf (remove URL rule)
3. Restart workflow
4. Send: "Visit https://test3.com"
5. Assert: Workflow logs warning about desync
6. Assert: Uses intersection (no URL detection)

### Test Case 4: Backend Health Check
1. Create desync (as above)
2. Call: GET /api/pii-detection/validate-config
3. Assert: Response shows `consistent: false`
4. Assert: Lists discrepancies

---

## Rollout Plan

1. **Phase 1: Workflow Fix** (LOW RISK)
   - Update PII_Redactor_v2 node
   - User imports new workflow
   - No backend changes needed
   - Immediate fix for desync issue

2. **Phase 2: Backend Logging** (LOW RISK)
   - Add debug logs to buildPiiConfUpdates()
   - Rebuild backend container
   - Better visibility for future debugging

3. **Phase 3: Health Check** (MEDIUM RISK)
   - Add new API endpoint
   - Update frontend to call validation
   - Show warning banner if desync detected

---

## Estimated Effort

- Workflow changes: 30 minutes
- Backend logging: 15 minutes
- Health check endpoint: 45 minutes
- Testing: 60 minutes
- Documentation: 30 minutes

**Total: ~3 hours**

---

## Success Criteria

✅ Regression test passes (2/2 tests)
✅ No desync between unified_config.json and pii.conf
✅ Workflow logs show single source of truth
✅ Backend health check detects inconsistencies
✅ Documentation updated

---

**Next Action:** Review plan with user, then implement Step 1 (Workflow Fix).
