# Plan: Permissions Refactor — Reduce Duplication & Add Translations

## Goals

1. Consolidate duplicated permission labels and categories into a single shared source
2. Add French translations to all permission-related UI strings
3. Fix a translation bug where `t3()` is evaluated at module load time instead of render time
4. Use compile-time exhaustiveness checks so adding a new permission produces build errors at every place that needs updating
5. Remove hardcoded permission field lists on the server in favour of shared helpers

## Current State

### Client — Permission Arrays

`USER_PERMISSIONS` (the instance-level equivalent of `PROJECT_PERMISSIONS`) is defined in `client/src/components/instance/user.tsx` and imported by `bulk_edit_permissions_form.tsx`. It should live in `lib/types/permissions.ts` alongside `PROJECT_PERMISSIONS`.

### Client — Permission Labels

Permission display labels are defined separately across the client in two patterns:

**Pattern A: `PERMISSION_LABELS` record** — defined in 6 files:

| # | File | Coverage | Notes |
|---|------|----------|-------|
| 1 | `client/src/components/instance/project_permission_form.tsx` | 6 of 17 project perms | Falls back to `key.replaceAll("_", " ")` for missing keys |
| 2 | `client/src/components/instance/bulk_edit_default_project_permissions_form.tsx` | All 17 project perms | |
| 3 | `client/src/components/forms_editors/select_project_user_role.tsx` | 6 of 17 project perms | Same fallback as #1 |
| 4 | `client/src/components/forms_editors/display_project_user_role.tsx` | 6 of 17 project perms | Same fallback as #1 |
| 5 | `client/src/components/forms_editors/bulk_edit_project_permissions_form.tsx` | All 17 project perms | Identical to #2 |
| 6 | `client/src/components/instance/bulk_edit_permissions_form.tsx` | All 8 instance perms | Uses `() => string` getter format |

Files 1-5 also duplicate `PERMISSION_CATEGORIES` identically — the groupings "Analytical Products", "Data & Modules", "Project Administration" with the same permission lists.

Files 1, 3, 4 duplicate a `getPermissionLabel(key)` helper with the `key.replaceAll("_", " ")` fallback.

**Pattern B: `permissionLabels` array** — different format in 1 file:

| # | File | Coverage | Notes |
|---|------|----------|-------|
| 7 | `client/src/components/project/project_settings.tsx` | All 17 project perms | Array of `{ key, label: TranslatableString }` objects. Different wording in places (e.g. "Configure visualizations" vs "can create and edit visualizations"). Used by `hasPermissions()` and `getPermissionSummary()` to build a comma-separated summary of a user's active permissions. |

### Client — Translation Bug

Files 1-5 define `PERMISSION_LABELS` as module-level `const` objects with `t3()` calls:

```ts
const PERMISSION_LABELS: Record<ProjectPermission, string> = {
  can_view_visualizations: t3({ en: "can view visualizations", fr: "..." }),
  // ...
};
```

Because `t3()` runs once when the module is imported (before the user's language may be set), these labels can get stuck in the wrong language. They need to be evaluated at render time instead.

### Server — Hardcoded Field Lists

`server/project_auth.ts` builds permission objects with explicit field-by-field assignments:

- **`getGlobalUser()`** — three copies of the 8 instance permission fields:
  - Admin: all `true` (lines 182-190)
  - From DB row: `rawUser.can_configure_users`, etc. (lines 194-201)
  - Unapproved: all `false` (lines 203-211)
- **`getProjectUser()`** — two copies of the 17 project permission fields:
  - Admin: all `true` (lines 286-302)
  - From DB row: `rawProjectUserRole.can_configure_settings`, etc. (lines 330-347)

The admin/no-access blocks duplicate constants that already exist in `lib/types/permissions.ts` (`_PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS`, `_PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS`). The "from DB row" blocks must be manually kept in sync — if a new permission is added to the type but forgotten here, it silently defaults to `undefined`.

### What's Already in Good Shape

- Permission types (`UserPermissions`, `ProjectUserPermissions`) live in shared `lib/types/permissions.ts`
- `PROJECT_PERMISSIONS` array, presets, and full/no-access constants are already in `lib/`
- Server middleware (`requireGlobalPermission`, `requireProjectPermission`) works generically via the type system
- DB column names match permission keys directly

---

## Plan

### Step 1: Make permission arrays exhaustive at compile time

In `lib/types/permissions.ts`, add `as const` and compile-time exhaustiveness assertions to the existing `PROJECT_PERMISSIONS` array, and create a new `USER_PERMISSIONS` array:

```ts
export const PROJECT_PERMISSIONS = [
  "can_configure_settings",
  "can_create_backups",
  "can_restore_backups",
  "can_configure_modules",
  "can_run_modules",
  "can_configure_users",
  "can_configure_visualizations",
  "can_view_visualizations",
  "can_configure_reports",
  "can_view_reports",
  "can_configure_slide_decks",
  "can_view_slide_decks",
  "can_configure_data",
  "can_view_data",
  "can_view_metrics",
  "can_view_logs",
  "can_view_script_code",
] as const satisfies readonly ProjectPermission[];

// If a permission is added to ProjectUserPermissions but not to this array, this line errors
type _AssertProjectExhaustive =
  Exclude<ProjectPermission, typeof PROJECT_PERMISSIONS[number]> extends never
    ? true
    : "ERROR: PROJECT_PERMISSIONS array is missing a permission key";
const _projectCheck: _AssertProjectExhaustive = true;
```

Same pattern for a new `USER_PERMISSIONS` array covering all 8 instance-level permission keys. This replaces the existing `USER_PERMISSIONS` in `client/src/components/instance/user.tsx` — delete it there and update `user.tsx` and `bulk_edit_permissions_form.tsx` to import from `lib` instead.

This is the foundation — every downstream helper and label record depends on these arrays being complete.

### Step 2: Add shared default constants and row-builder helpers

In `lib/types/permissions.ts`, add instance-level equivalents of the existing project defaults:

```ts
export const _USER_PERMISSIONS_DEFAULT_NO_ACCESS: UserPermissions = { /* all false */ };
export const _USER_PERMISSIONS_DEFAULT_FULL_ACCESS: UserPermissions = { /* all true */ };
```

These are typed `UserPermissions`, so TypeScript enforces that every field is present.

Add helpers to build a typed permissions object from a DB row:

```ts
export function buildProjectPermissionsFromRow(
  row: Record<string, unknown>,
): ProjectUserPermissions {
  return Object.fromEntries(
    PROJECT_PERMISSIONS.map((k) => {
      const val = row[k];
      if (val === undefined) {
        console.warn(`buildProjectPermissionsFromRow: missing column "${k}" — defaulting to false`);
      }
      return [k, !!val];
    }),
  ) as ProjectUserPermissions;
}

export function buildUserPermissionsFromRow(
  row: Record<string, unknown>,
): UserPermissions {
  return Object.fromEntries(
    USER_PERMISSIONS.map((k) => {
      const val = row[k];
      if (val === undefined) {
        console.warn(`buildUserPermissionsFromRow: missing column "${k}" — defaulting to false`);
      }
      return [k, !!val];
    }),
  ) as UserPermissions;
}
```

The `as` cast is safe here because Step 1's exhaustiveness assertion guarantees the arrays contain every key. If a DB column is genuinely missing, `!!undefined` evaluates to `false` — which is fail-closed (denies access rather than granting it). The `console.warn` ensures this doesn't go unnoticed during development, making it easy to catch migration drift.

### Step 3: Create shared label and category definitions

Create new file `lib/types/permission_labels.ts`:

```ts
import type { TranslatableString } from "../translate/types.ts";
import type { ProjectPermission, UserPermission } from "./permissions.ts";
import { PROJECT_PERMISSIONS } from "./permissions.ts";

// Typed as Record<ProjectPermission, ...> — compile error if a key is missing.
// These are plain data (TranslatableString), not pre-evaluated t3() strings,
// so module-level constants are fine. The caller wraps with t3() at render time.
export const PROJECT_PERMISSION_LABELS: Record<ProjectPermission, TranslatableString> = {
  can_configure_settings: { en: "Configure settings", fr: "Configurer les paramètres" },
  can_create_backups: { en: "Create backups", fr: "Créer des sauvegardes" },
  can_restore_backups: { en: "Restore backups", fr: "Restaurer des sauvegardes" },
  can_configure_modules: { en: "Configure modules", fr: "Configurer les modules" },
  can_run_modules: { en: "Run modules", fr: "Exécuter les modules" },
  can_configure_users: { en: "Configure users", fr: "Configurer les utilisateurs" },
  can_configure_visualizations: { en: "Configure visualizations", fr: "Configurer les visualisations" },
  can_view_visualizations: { en: "View visualizations", fr: "Voir les visualisations" },
  can_configure_reports: { en: "Configure reports", fr: "Configurer les rapports" },
  can_view_reports: { en: "View reports", fr: "Voir les rapports" },
  can_configure_slide_decks: { en: "Configure slide decks", fr: "Configurer les présentations" },
  can_view_slide_decks: { en: "View slide decks", fr: "Voir les présentations" },
  can_configure_data: { en: "Configure data", fr: "Configurer les données" },
  can_view_data: { en: "View data", fr: "Voir les données" },
  can_view_metrics: { en: "View metrics", fr: "Voir les métriques" },
  can_view_logs: { en: "View logs", fr: "Voir les journaux" },
  can_view_script_code: { en: "View script code", fr: "Voir le code des scripts" },
};

export const INSTANCE_PERMISSION_LABELS: Record<UserPermission, TranslatableString> = {
  can_configure_users: { en: "Configure users", fr: "Configurer les utilisateurs" },
  can_view_users: { en: "View users", fr: "Voir les utilisateurs" },
  can_view_logs: { en: "View logs", fr: "Voir les journaux" },
  can_configure_settings: { en: "Configure settings", fr: "Configurer les paramètres" },
  can_configure_assets: { en: "Configure assets", fr: "Configurer les ressources" },
  can_configure_data: { en: "Configure data", fr: "Configurer les données" },
  can_view_data: { en: "View data", fr: "Voir les données" },
  can_create_projects: { en: "Create projects", fr: "Créer des projets" },
};

// Category groupings used by the permission checkbox UIs.
// Same as labels — plain data, module-level constant is fine.
export type ProjectPermissionCategory = {
  label: TranslatableString;
  permissions: ProjectPermission[];
};

export const PROJECT_PERMISSION_CATEGORIES: ProjectPermissionCategory[] = [
  {
    label: { en: "Analytical Products", fr: "Produits analytiques" },
    permissions: [
      "can_view_visualizations",
      "can_configure_visualizations",
      "can_view_reports",
      "can_configure_reports",
      "can_view_slide_decks",
      "can_configure_slide_decks",
    ],
  },
  {
    label: { en: "Data & Modules", fr: "Données et modules" },
    permissions: [
      "can_view_data",
      "can_configure_data",
      "can_view_metrics",
      "can_view_script_code",
      "can_configure_modules",
      "can_run_modules",
    ],
  },
  {
    label: { en: "Project Administration", fr: "Administration du projet" },
    permissions: [
      "can_configure_settings",
      "can_configure_users",
      "can_view_logs",
      "can_create_backups",
      "can_restore_backups",
    ],
  },
];

// Dev-time assertion: every project permission should appear in exactly one category.
// Not enforced at the type level (categories are a UI concern), but this catches
// forgetting to slot a new permission into the UI.
const _allCategorizedPermissions = PROJECT_PERMISSION_CATEGORIES.flatMap((c) => c.permissions);
const _missingFromCategories = PROJECT_PERMISSIONS.filter(
  (p) => !_allCategorizedPermissions.includes(p),
);
if (_missingFromCategories.length > 0) {
  console.warn(
    `Permissions missing from UI categories: ${_missingFromCategories.join(", ")}`,
  );
}
```

Note on import path: files within `lib/types/` import `TranslatableString` from `"../translate/types.ts"` (not from `panther` directly). This matches the existing pattern in `lib/types/module_definition_schema.ts` and `lib/types/module_definitions.ts`.

Export from `lib/types/mod.ts` and `lib/mod.ts`.

### Step 4: Translate preset labels

In `lib/types/permissions.ts`, change `PERMISSION_PRESETS` label type from `string` to `TranslatableString`:

```ts
export const PERMISSION_PRESETS: {
  label: TranslatableString;
  permissions: Record<ProjectPermission, boolean>;
}[] = [
  { label: { en: "No access", fr: "Aucun accès" }, permissions: ... },
  { label: { en: "Viewer", fr: "Lecteur" }, permissions: ... },
  { label: { en: "Editor", fr: "Éditeur" }, permissions: ... },
  { label: { en: "Admin", fr: "Administrateur" }, permissions: ... },
];
```

Update all call sites that reference `preset.label` to use `t3(preset.label)`. This includes removing inline type annotations in files 2, 3, and 5 that annotate the `preset` parameter as `{ label: string; ... }` — these become type errors once `label` is `TranslatableString`.

### Step 5: Update client files to use shared definitions

**Files 1-5 (Pattern A — `PERMISSION_LABELS` record + `PERMISSION_CATEGORIES`):**

Delete local `PERMISSION_LABELS`, `PERMISSION_CATEGORIES`, and `getPermissionLabel()`. Replace with imports:

```ts
import {
  PROJECT_PERMISSION_LABELS,
  PROJECT_PERMISSION_CATEGORIES,
} from "lib";
```

Usage at call sites changes from:
```ts
// Before (evaluated once at import)
PERMISSION_LABELS[key]

// After (evaluated at render time, supports language switching)
t3(PROJECT_PERMISSION_LABELS[key])
```

Each file goes from ~40 lines of local definitions to 1-2 imports.

**File 6 (`bulk_edit_permissions_form.tsx` — instance permissions):**

Delete local `PERMISSION_LABELS` (which uses `() => string` getter format to work around the t3() bug). Replace with:

```ts
import { INSTANCE_PERMISSION_LABELS } from "lib";
// Usage (note: no more () invocation — t3() returns the string directly):
t3(INSTANCE_PERMISSION_LABELS[key])
```

**File 7 (`project_settings.tsx` — Pattern B, different format):**

This file is structured differently from the others. It defines a `permissionLabels` array of `{ key, label }` objects and uses it in two helpers:

```ts
// Current code (lines 465-479):
function hasPermissions(user: ProjectUser): boolean {
  return permissionLabels.some((p) => user[p.key]);
}

function getPermissionSummary(user: ProjectUser): string {
  const active = permissionLabels.filter((p) => user[p.key]);
  if (active.length === 0) return t3({ en: "Does not have access", fr: "N'a pas accès" });
  const shown = active.slice(0, 5).map((p) => t3(p.label)).join(", ");
  if (active.length > 5) return `${shown}, +${active.length - 5} ${t3({ en: "more", fr: "de plus" })}`;
  return shown;
}
```

Delete the local `permissionLabels` array (~75 lines) and rewrite these helpers to iterate over the shared `PROJECT_PERMISSIONS` array:

```ts
import { PROJECT_PERMISSIONS, PROJECT_PERMISSION_LABELS } from "lib";

function hasPermissions(user: ProjectUser): boolean {
  return PROJECT_PERMISSIONS.some((k) => user[k]);
}

function getPermissionSummary(user: ProjectUser): string {
  const active = PROJECT_PERMISSIONS.filter((k) => user[k]);
  if (active.length === 0) return t3({ en: "Does not have access", fr: "N'a pas accès" });
  const shown = active.slice(0, 5).map((k) => t3(PROJECT_PERMISSION_LABELS[k])).join(", ");
  if (active.length > 5) return `${shown}, +${active.length - 5} ${t3({ en: "more", fr: "de plus" })}`;
  return shown;
}
```

This also standardizes the wording to match the rest of the app.

**File 8 (`instance/user.tsx`):**

Delete the local `USER_PERMISSIONS` array export (moved to `lib/types/permissions.ts` in Step 1). Update `user.tsx` and `bulk_edit_permissions_form.tsx` to import `USER_PERMISSIONS` from `lib` instead.

Also update the permission checkbox labels in `user.tsx` (line 198) — currently uses `key.replaceAll("_", " ")` which produces un-translated lowercase labels like "can view data". Replace with `t3(INSTANCE_PERMISSION_LABELS[key])`.

Remove the `export` keyword from `makeDefaultProjectPermissions` in `project_permission_form.tsx` — it's only used within that file.

### Step 6: Simplify server permission building

In `server/project_auth.ts`, replace hardcoded field lists with shared constants and helpers:

**`getGlobalUser()` — admin/unapproved permissions:**
```ts
// Before: 8 explicit fields x3 (admin, from-db, unapproved)
// After:
const thisUserPermissions = isGlobalAdmin
  ? _USER_PERMISSIONS_DEFAULT_FULL_ACCESS
  : rawUser
    ? buildUserPermissionsFromRow(rawUser)
    : _USER_PERMISSIONS_DEFAULT_NO_ACCESS;
```

**`getProjectUser()` — admin project permissions:**
```ts
// Before: 17 explicit fields, all true
// After:
projectUser: {
  email: globalUser.email,
  role: "editor",
  isGlobalAdmin: true,
  ..._PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
},
```

**`getProjectUser()` — regular user permissions from DB row:**
```ts
// Before: 17 manual field-by-field mappings
// After:
projectUser: {
  email: globalUser.email,
  role: rawProjectUserRole.role === "editor" ? "editor" : "viewer",
  isGlobalAdmin: false,
  ...buildProjectPermissionsFromRow(rawProjectUserRole),
},
```

### Step 7: Verify

- `deno task typecheck` — no type errors in server or client
- Spot-check that permission UI renders correctly in both English and French
- **Smoke test the safety chain:** temporarily add `can_do_something: boolean` to `ProjectUserPermissions` and confirm the build breaks in: `PROJECT_PERMISSIONS` array, `PROJECT_PERMISSION_LABELS`, `_PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS`, `_PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS`, and each `PERMISSION_PRESETS` entry. Then remove it.

---

## Compile-Time Safety Chain

When a new permission is added to `ProjectUserPermissions`, the following all fail at compile time:

| What | Why it fails | File |
|------|-------------|------|
| `PROJECT_PERMISSIONS` array | Exhaustiveness assertion (`Exclude<...> extends never`) | `lib/types/permissions.ts` |
| `PROJECT_PERMISSION_LABELS` | `Record<ProjectPermission, TranslatableString>` missing key | `lib/types/permission_labels.ts` |
| `INSTANCE_PERMISSION_LABELS` | `Record<UserPermission, TranslatableString>` missing key | `lib/types/permission_labels.ts` |
| `_PROJECT_USER_PERMISSIONS_DEFAULT_FULL_ACCESS` | `Record<ProjectPermission, boolean>` missing key | `lib/types/permissions.ts` |
| `_PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS` | Same | `lib/types/permissions.ts` |
| Each entry in `PERMISSION_PRESETS` | `Record<ProjectPermission, boolean>` missing key | `lib/types/permissions.ts` |

Additionally, a dev-time `console.warn` fires if:
- A new permission is not added to any UI category (in `permission_labels.ts`)
- A DB column is missing for a permission (in `buildProjectPermissionsFromRow`)

The only fully manual step is the DB migration (adding the column to the `project_user_roles` and `users` tables). This was also not caught before — it has always been a manual step.

## Risks & Caveats

- **Wording standardization**: The current labels vary across files ("can create and edit visualizations" vs "Configure visualizations"). This refactor standardizes on the shorter "Configure X" / "View X" style. Check with stakeholders if any specific wording is preferred.
- **`buildProjectPermissionsFromRow` relies on DB column names matching permission keys exactly** (e.g. `can_view_data`). This is already the case and has been since the schema was created, but it's worth noting as an assumption.
- **The `as` cast in the row-builder helpers** bypasses TypeScript's structural check on the output. Safety comes from the exhaustiveness assertion on the input array, not from TypeScript verifying the output shape. If the exhaustiveness assertion is ever removed, the cast becomes unsafe.

## Summary of Impact

| What | Before | After |
|------|--------|-------|
| Project permission label definitions | 6 files (+ 1 different format) | 1 shared file |
| Permission categories definitions | 5 files | 1 shared file |
| `getPermissionLabel()` helpers | 3 files | 0 (built-in) |
| Server hardcoded permission objects | 3 blocks (~50 lines) | Shared constants |
| Server manual field mapping | 17-line block | 1-line spread with helper |
| Translation support | Partial/inconsistent | All labels have en/fr |
| `t3()` evaluation bug | Present in 5 files | Fixed (labels are `TranslatableString`, `t3()` called at render) |
| Adding a new permission | Update ~10 places manually | Type errors guide you to every place |
