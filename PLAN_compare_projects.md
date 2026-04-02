# Plan: Cross-Project Module Comparison

## Context

Admins need to see module state across all projects at a glance — which modules are installed, their run state, commit SHAs, and parameter settings. Currently you have to navigate into each project individually. This adds a "Compare projects" button on the instance projects page that opens an editor component showing a comparison table.

This table is also the foundation for future features:
- **Batch update versions** across projects — the table shows `installedGitRef` per project, making it obvious which are out of date
- **Batch update settings** across projects — the table shows parameter values per project, making differences visible
- **Instance-level default settings** — could appear as an extra "Default" column in the table
- **"Update to default"** per project — compare a project's settings against the default column

The current plan builds the read-only comparison table. The data shape is designed to support these future actions without changes.

## New types

```typescript
type CompareProjectsModuleParameter = {
  replacementString: string;
  description: string;
  value: string;
};

type CompareProjectsModule = {
  id: string;
  dirty: "queued" | "ready" | "error";
  installedAt: string;
  installedGitRef?: string;
  lastRunAt: string;
  lastRunGitRef?: string;
  parameters: CompareProjectsModuleParameter[];
};

type CompareProjectsData = {
  projects: {
    id: string;
    label: string;
    modules: CompareProjectsModule[];
  }[];
};
```

### Design decisions

- **`dirty` uses DB values only** (`"queued" | "ready" | "error"`), not `DirtyOrRunStatus`. The `"running"` state is in-memory only (from `running_tasks_map.ts`). For a comparison table, the distinction between queued and running doesn't matter, and avoiding the task manager coupling keeps the endpoint simple.
- **`parameters` is an array with labels**, not a flat `Record<string, string>`. The `description` field comes from `parameterDefinitions` in the stored `config_selections` JSON, so the table can show human-readable row labels instead of replacement strings like `{{MIN_COUNT}}`.
- **Access control**: requires admin via `requireGlobalPermission({ requireAdmin: true })` — cross-project data is sensitive.

## New endpoint

`GET /modules/compare_projects`

Instance-level, under the `/modules/` namespace (consistent with `/modules/check_updates`). No request body. Requires admin.

Server implementation:
1. Query all projects from main DB: `SELECT id, label FROM projects ORDER BY LOWER(label)`
2. For each project, get a read-only connection via `getPgConnectionFromCacheOrNew(project.id, "READ_ONLY")`
3. Query `SELECT id, dirty, installed_at, installed_git_ref, last_run_at, last_run_git_ref, config_selections FROM modules`
4. Parse `config_selections` via `parseModuleConfigSelections()` — currently private in `server/db/project/modules.ts:36`, export it and import in the handler
5. Extract `parameterSelections` (values) and `parameterDefinitions` (for labels/descriptions)
6. Build `CompareProjectsModuleParameter[]` by joining definitions with selections
7. Run all project queries in parallel via `Promise.all`
8. Return `CompareProjectsData`

### Files

- Route registry: `lib/api-routes/instance/modules.ts` (add to existing `instanceModuleRouteRegistry`)
- Server route: `server/routes/instance/modules.ts` (add handler with `requireGlobalPermission({ requireAdmin: true })`)
- Types: `lib/types/modules.ts` (add types)

## UX

A table with:
- **Columns**: one per project (from response, ordered by label)
- **Rows**: grouped by module (from `MODULE_REGISTRY` order)
- **Cells**: for each project × module, show:
  - Not installed: greyed out "—"
  - Installed: dirty state, `installedGitRef` (short SHA), `lastRunGitRef` (short SHA), parameter values

The editor opens via `openEditor` from the existing `getEditorWrapper` on `instance_projects.tsx` (line 27). On mount, it calls the endpoint via `timQuery` + `StateHolderWrapper`.

### Table layout

```
                      | Project A    | Project B    | Project C    |
M1. Data quality      |              |              |              |
  Status              | Ready        | Queued       | —            |
  Installed SHA       | de24ead      | de24ead      | —            |
  Last run SHA        | de24ead      | —            | —            |
  Minimum count       | 5            | 10           | —            |
  Threshold           | 0.05         | 0.05         | —            |
M2. Adjustments       |              |              |              |
  Status              | Ready        | Ready        | —            |
  Installed SHA       | ab12cde      | ff34567      | —            |
  ...                 |              |              |              |
```

Modules as row groups. Under each module: status row, SHA rows, then parameter rows using human-readable descriptions as labels. Uninstalled modules show "—" greyed out. Values that differ across projects could be highlighted.

## New client component

`client/src/components/instance/compare_projects.tsx`

Must follow `panther/FRONTEND_STYLE_GUIDE.md`:
- Function declarations (not arrow functions) for components, `p` for props
- `timQuery` for data fetching (never `createResource`)
- Panther components only (`Button`, `FrameTop`, `HeadingBar`, `StateHolderWrapper`)
- Panther CSS utilities (`ui-pad`, `ui-gap`, `ui-spy`, semantic colors)
- No conditional returns — use `Show`/`Switch`/`Match`
- Sentence case for all UI text

Uses `EditorComponentProps` pattern (like `view_script.tsx`):
- `timQuery` calls `serverActions.compareProjects({})`
- `StateHolderWrapper` handles loading/error
- Renders a table with horizontal scroll for many projects
- `FrameTop` + `HeadingBar` with a "Done" close button

## Button placement

In `instance_projects.tsx`, add a "Compare projects" button next to "Create project" in the `HeadingBarMainRibbon`. Clicking it calls `openEditor` with the new `CompareProjects` component.

## Files to create

- `client/src/components/instance/compare_projects.tsx`

## Files to modify

- `lib/types/modules.ts` — add `CompareProjectsModuleParameter`, `CompareProjectsModule`, and `CompareProjectsData` types
- `lib/api-routes/instance/modules.ts` — add `compareProjects` route
- `server/routes/instance/modules.ts` — implement handler
- `server/db/project/modules.ts` — export `parseModuleConfigSelections()`
- `client/src/components/instance/instance_projects.tsx` — add button

## Future extensibility

The table is designed as a foundation:

| Future feature | What the table provides | What's needed additionally |
|---|---|---|
| Batch update versions | Shows which project/module combos are out of date (compare `installedGitRef` vs HEAD) | Selection checkboxes + action button calling `updateModuleDefinition` per selected pair |
| Batch update settings | Shows current parameter values with labels per project | Source picker (copy from project X), selection UI, calls to `updateModuleParameters` |
| Instance default settings | — | New `module_defaults` table in main DB, UI to configure, extra "Default" column in table |
| Update to default | Shows current values to compare against default | Reads instance defaults, calls `updateModuleParameters` with default values |

None of these require changes to the comparison data shape — they add UI actions on top of the existing table.

## Verification

- Navigate to instance projects page → "Compare projects" button visible
- Click → editor opens with loading state
- Table shows all projects as columns, all modules as rows
- Each cell shows dirty state, SHAs, and parameter values with human-readable labels
- Uninstalled modules show "—"
- "Done" closes the editor
- `deno task typecheck` passes
