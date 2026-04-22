# Module Update System — Specification

## Overview

When a module definition is updated (from GitHub or local), we need to:
1. Update stored metadata (module definition, metrics, presentation objects)
2. Optionally trigger a re-run of the module's R script

The key principle: **the client decides what to do, and the server executes that decision exactly**.

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
    vizPresets: boolean;
    label: boolean;
    dataSources: boolean;
    assetsToImport: boolean;
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
  reinstall: boolean;      // update the module definition
  rerun: boolean;          // mark module dirty and trigger rerun
  preserveSettings: boolean;  // keep user's parameter selections
}
```

The client sends exactly what it wants. The server executes:
- `reinstall: true` → Update module definition, metrics, presentation objects
- `rerun: true` → Set dirty='queued', drop data tables, call setModuleDirty()
- Both can be true (reinstall + rerun) or independent

---

## Server Behavior

### When `reinstall: true, rerun: true`

1. Fetch latest module definition
2. Delete existing module row (cascades to metrics, results_objects metadata)
3. Drop results_object data tables
4. Insert new module with dirty='ready' (route handler then queues it)
5. Insert new results_objects, metrics, presentation_objects
6. Update timestamps:
   - `compute_def_updated_at` only if compute-affecting changes occurred
   - `presentation_def_updated_at` always
7. Call setModuleDirty() to notify task manager
8. SSE notify clients

### When `reinstall: true, rerun: false`

1. Fetch latest module definition
2. Update module row in place (keep dirty state as-is)
3. Delete and recreate results_objects metadata (NOT data tables)
4. Delete and recreate metrics
5. Delete and recreate default presentation_objects
6. Update timestamps:
   - `compute_def_updated_at` only if compute-affecting changes occurred
   - `presentation_def_updated_at` always
7. SSE notify clients

Key difference: `rerun: false` preserves the actual data tables and dirty state.

### When `reinstall: false, rerun: true`

1. Just mark module dirty and trigger rerun
2. No definition changes

---

## Database Schema

### Module Timestamps

| Column | Description |
|--------|-------------|
| `compute_def_updated_at` | When compute-affecting definitions (script, configReq, resultsObj) last changed |
| `compute_def_git_ref` | Git ref when compute definitions were last updated |
| `presentation_def_updated_at` | When any definition was last installed |
| `presentation_def_git_ref` | Git ref of most recent install |
| `config_updated_at` | When user changed parameters |
| `last_run_at` | When module last completed execution |
| `last_run_git_ref` | Git ref at last run time (copied from compute_def_git_ref on run) |

Note: `installed_at` was removed as it was redundant with `presentation_def_updated_at`.

### Timestamp Update Logic

- **Fresh install**: All timestamps set to now, all git refs set to current
- **Reinstall with compute changes**: `compute_def_*` and `presentation_def_*` both updated
- **Reinstall with presentation-only changes**: Only `presentation_def_*` updated, `compute_def_*` preserved
- **Module run completes**: `last_run_at` set to now, `last_run_git_ref` copied from `compute_def_git_ref`

---

## Client UI

### Module Status Display

Shows three timestamp lines:
```
Compute definitions: 2024-01-15 10:30 AM (abc1234)
Presentation definitions: 2024-01-16 2:00 PM (def5678)
Last run: 2024-01-15 11:00 AM (abc1234) — results outdated
```

- Git ref shown on all three lines (compute, presentation, last run)
- "Results outdated" warning (red) only when `last_run_at < compute_def_updated_at`

### Staleness Logic

```typescript
const resultsStale = computeDefUpdatedAt 
  ? new Date(computeDefUpdatedAt) > new Date(lastRunAt)
  : false;
```

This means:
- Presentation-only changes do NOT trigger staleness warning
- Only compute-affecting changes show "results outdated"

### Update Modal

**1. No Update Available** (`hasUpdate: false`)
```
Module is up to date (abc1234)

[Cancel]
```

**2. Update Available — Presentation Only** (`hasUpdate: true`, `recommendsRerun: false`)
```
Update available (abc1234 → def5678)

Visualization changes only:
[Metrics] [Viz presets] [Label]

[ ] Reinstall definition
    [ ] Preserve settings
[ ] Rerun module

[Cancel] [Update]
```

**3. Update Available — Compute Affecting** (`hasUpdate: true`, `recommendsRerun: true`)
```
Update available (abc1234 → def5678)

May change results:
[Script] [Config requirements] [Results objects]

Visualization changes only:
[Metrics]

[x] Reinstall definition
    [x] Preserve settings
[x] Rerun module (recommended)

[Cancel] [Update]
```

### Default Checkbox States

- `reinstall`: Defaults to `hasUpdate` (checked if update available)
- `rerun`: Defaults to `recommendsRerun` (checked if compute-affecting changes)
- `preserveSettings`: Always defaults to `true`

---

## "Update Available" Indicator

The sidebar shows a badge when modules need updating.

**How it works**:
1. Client fetches `moduleLatestCommits` from instance endpoint
2. Client compares each module's `presentationDefGitRef` to latest
3. If any module is behind, show badge

**After update**:
1. Server updates `presentation_def_git_ref` in database
2. Server sends SSE notification for "modules" entity
3. Client refetches project detail (includes new `presentationDefGitRef`)
4. Comparison re-evaluates, badge clears

---

## Comparison Logic

All definition comparison logic is centralized in `server/module_loader/compare_definitions.ts`:

```typescript
// Full comparison for preview
compareDefinitions(incoming, storedDef, storedMetrics): DefinitionChanges

// Quick check for compute-affecting only
hasComputeAffectingChanges(script, configReq, resultsObj, storedDef): boolean

// Check if rerun is recommended
recommendsRerun(changes: DefinitionChanges): boolean
```

---

## Testing Checklist

- [ ] Update with `reinstall + rerun` drops tables and reruns
- [ ] Update with `reinstall` only preserves data tables
- [ ] Presentation-only change does NOT update `compute_def_updated_at`
- [ ] Script change DOES update `compute_def_updated_at`
- [ ] "Results outdated" only shows when `compute_def_updated_at > last_run_at`
- [ ] "Update available" badge clears after reinstall
- [ ] Git refs display correctly on all three timestamp lines
- [ ] `last_run_git_ref` is set from `compute_def_git_ref` on run completion
- [ ] Preserve settings works correctly
