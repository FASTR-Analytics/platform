# Module Update System — Specification

## Overview

When a module definition is updated (from GitHub or local), we need to:
1. Update stored metadata (module definition, metrics, presentation objects)
2. Optionally trigger a re-run of the module's R script

The key principle: **the client decides whether to rerun, and the server executes that decision exactly**.

---

## What Can Change

A module definition consists of:

| Field | Affects Compute? | Description |
|-------|-----------------|-------------|
| `script` | YES | The R script itself |
| `configRequirements` | YES | Parameters that affect script execution |
| `resultsObjects` | YES | Output table schemas |
| `label` | NO | Display name |
| `metrics` | NO | Metric definitions (vizPresets, labels, etc.) |
| `defaultPresentationObjects` | NO | Default chart configurations |
| `dataSources` | NO | Data source declarations |
| `assetsToImport` | NO | Asset file list |

**Compute-affecting changes** = changes to fields that could produce different results from the R script.

**Presentation-only changes** = changes to how results are displayed, not computed.

---

## API Design

### Preview Endpoint

`GET /project/:projectId/module/:module_id/preview_update`

Returns:
```typescript
{
  hasUpdate: boolean;              // gitRef differs from installed
  currentGitRef: string | null;    // installed git ref
  incomingGitRef: string;          // latest git ref from source
  
  changes: {
    script: boolean;
    configRequirements: boolean;
    resultsObjects: boolean;
    metrics: boolean;
    label: boolean;
    // ... other fields
  };
  
  recommendsRerun: boolean;        // true if any compute-affecting field changed
  
  commitsSince: Array<{
    sha: string;
    message: string;
    date: string;
    author: string;
  }>;
}
```

The preview does NOT decide what will happen. It reports facts.

### Update Endpoint

`POST /project/:projectId/update_module_definition/:module_id`

Body:
```typescript
{
  preserveSettings: boolean;  // keep user's parameter selections
  rerun: boolean;             // whether to mark module dirty and trigger rerun
}
```

The `rerun` boolean is explicit. The server does exactly what it's told:
- `rerun: true` → Set dirty='queued', call setModuleDirty()
- `rerun: false` → Keep current dirty state, no rerun triggered

---

## Server Behavior

### When `rerun: true`

1. Fetch latest module definition
2. Delete existing module row (cascades to metrics, results_objects metadata)
3. Drop results_object data tables
4. Insert new module with dirty='queued'
5. Insert new results_objects, metrics, presentation_objects
6. Call setModuleDirty() to notify task manager
7. SSE notify clients

### When `rerun: false`

1. Fetch latest module definition
2. Update module row in place (keep dirty state as-is)
3. Delete and recreate results_objects metadata (NOT data tables)
4. Delete and recreate metrics
5. Delete and recreate default presentation_objects
6. SSE notify clients

Key difference: `rerun: false` preserves the actual data tables and dirty state.

---

## Client UI

### Update Modal States

**1. No Update Available** (`hasUpdate: false`)
```
This module is already up to date (git ref: abc1234).

[ ] Force reinstall (will rerun module)

[Cancel] [Update]
```

**2. Presentation-Only Changes** (`hasUpdate: true`, `recommendsRerun: false`)
```
Update available (abc1234 → def5678)

Changes:
- Metric labels updated
- Visualization presets updated

These changes do not affect computed results.

[ ] Also rerun module (not recommended)

[Cancel] [Update]
```

**3. Compute-Affecting Changes** (`hasUpdate: true`, `recommendsRerun: true`)
```
Update available (abc1234 → def5678)

Changes:
- Script modified
- Config requirements changed

These changes affect computed results. A rerun is recommended.

[x] Rerun module (recommended)
[ ] Preserve settings

[Cancel] [Update]
```

### Logic

```typescript
// Default rerun value based on recommendation
const [rerun, setRerun] = createSignal(preview.recommendsRerun);

// If no update but user wants to force reinstall, they check the box
// If update with compute changes, rerun is checked by default
// If update with presentation-only, rerun is unchecked by default
```

---

## "Needs Update" Indicator

The sidebar shows a badge when modules need updating.

**How it works**:
1. Client fetches `moduleLatestCommits` from instance endpoint (latest git refs)
2. Client compares each module's `installedGitRef` to latest
3. If any module is behind, show badge

**After update**:
1. Server updates `installed_git_ref` in database
2. Server sends SSE notification for "modules" entity
3. Client refetches project detail (includes new `installedGitRef`)
4. Comparison re-evaluates, badge clears

---

## Timestamps

Current columns:
- `installed_at` — when module was installed/reinstalled
- `script_updated_at` — when script last changed
- `definition_updated_at` — when definition last updated
- `config_updated_at` — when user changed parameters
- `last_run_at` — when module last completed execution
- `installed_git_ref` — git ref at install time
- `last_run_git_ref` — git ref at last run time

### Display Logic

For "run freshness" indicator:
- Compare `last_run_git_ref` to `installed_git_ref`
- If different: "Results may be stale — module updated since last run"
- If same: "Results current"

For "update available" indicator:
- Compare `installed_git_ref` to latest from GitHub
- If different: "Update available"
- If same: "Up to date"

---

## Migration Notes

### API Changes

1. Rename `preventRerun` → `rerun` (inverted boolean)
2. Update `ModuleUpdatePreview` type:
   - Remove `impactType` enum
   - Add `hasUpdate`, `changes`, `recommendsRerun`

### Database

No schema changes needed. Existing columns sufficient.

### Client

1. Update modal to show detailed changes
2. Checkbox becomes "Rerun module" (checked/unchecked based on recommendation)
3. Update staleness indicator logic if needed

---

## Testing Checklist

- [ ] Update with `rerun: true` drops tables and reruns
- [ ] Update with `rerun: false` preserves data tables
- [ ] Presentation-only change defaults to no rerun
- [ ] Script change defaults to rerun
- [ ] "Needs update" badge clears after update
- [ ] "Results stale" indicator shows when gitRefs differ
- [ ] Force reinstall works when "no update available"
- [ ] Preserve settings works correctly
