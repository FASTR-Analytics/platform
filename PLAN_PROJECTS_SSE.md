# Plan: Per-User Projects via SSE

## Problem

Projects are per-user data - global admins see all projects, non-admins only see projects they have permissions for. Currently:

1. **`starting` message**: Correctly sends per-user projects (via `getInstanceDetail` which filters by `globalUser`)
2. **`projects_updated` message**: Broadcasts ALL projects to everyone via `getAllProjectSummaries()` - this is a bug that leaks project visibility
3. **Permission changes**: No notification at all when:
   - User's `isGlobalAdmin` status changes
   - User is added/removed from a project via `project_user_roles`
   - User's project-level permissions change

### Affected scenarios

| Scenario | Current behavior | Expected behavior |
|----------|------------------|-------------------|
| Global admin status changes | `users_updated` fires, buttons update, but project list unchanged | Project list should update |
| User added to project | No notification | Project list should update |
| User removed from project | No notification | Project list should update |
| Project created/deleted | `projects_updated` broadcasts ALL projects to everyone (bug) | Each user sees their filtered list |
| Project renamed/locked | `projects_updated` broadcasts ALL projects to everyone (bug) | Each user sees their filtered list |

## Solutions explored

### 1. Server-side per-connection filtering

SSE endpoint intercepts `projects_updated` and re-queries projects for each connection's `globalUser`.

**Rejected because:** Doesn't solve the trigger problem. Permission changes still wouldn't broadcast anything.

### 2. Full T2 reactive cache

Move projects to T2 with IndexedDB caching, `StateHolder` pattern in components.

**Rejected because:** T2 exists for "data too large for SSE". Projects are small. Wrong tool for the problem. Also requires component refactoring.

### 3. T1 per-connection with fetch (chosen)

Extend the existing T1 per-connection pattern. Projects stay in T1 store, but updated via fetch when version changes.

**Why this fits:**
- T1 already has per-connection fields (`currentUser*`) documented in DOC_STATE_MGT_INSTANCE.md
- `currentUser*` fields: re-derived from broadcast data
- `projects`: fetched (can't re-derive because broadcast can't contain every user's project list)
- Same tier, same concept, different update mechanism

## Solution design

### Message type change

**Before:**
```typescript
{ type: "projects_updated"; data: ProjectSummary[] }
```

**After:**
```typescript
{ type: "projects_last_updated"; data: string }
```

The payload is a timestamp/version string, not project data. Each client fetches its own projects.

### State change

Add to `InstanceState`:
```typescript
projectsLastUpdated: string;
```

### Client flow

1. `projects_last_updated` message arrives
2. SSE handler updates `instanceState.projectsLastUpdated`
3. `createEffect` in `InstanceSSEBoundary` detects change
4. Effect fetches `/my_projects` with abort controller
5. On success, calls `updateInstanceProjects()`

### Server flow

1. Any permission-affecting change happens
2. Server calls `notifyInstanceProjectsLastUpdated(new Date().toISOString())`
3. BroadcastChannel sends to all SSE connections
4. Each client fetches its own filtered project list

## Implementation

### 1. Types (`lib/types/instance_sse.ts`)

```typescript
// Remove from InstanceSseMessage union:
| { type: "projects_updated"; data: ProjectSummary[] }

// Add to InstanceSseMessage union:
| { type: "projects_last_updated"; data: string }

// Add to InstanceState:
projectsLastUpdated: string;
```

### 2. Server notification (`server/task_management/notify_instance_updated.ts`)

```typescript
// Remove:
export function notifyInstanceProjectsUpdated(projects: ProjectSummary[]) {
  notifyInstanceUpdate({ type: "projects_updated", data: projects });
}

// Add:
export function notifyInstanceProjectsLastUpdated(lastUpdated: string) {
  notifyInstanceUpdate({ type: "projects_last_updated", data: lastUpdated });
}
```

### 3. Server endpoint (`server/routes/instance/instance.ts`)

Add new route using `defineRoute` pattern:

```typescript
import { getProjectsForUser } from "../../db/mod.ts";

defineRoute(
  routesInstance,
  "getMyProjects",
  requireGlobalPermission(),
  async (c) => {
    const projects = await getProjectsForUser(c.var.mainDb, c.var.globalUser);
    return c.json({ success: true, data: projects });
  },
);
```

### 4. Server DB function (`server/db/instance/instance.ts`)

Extract the project query logic from `getInstanceDetail` into a reusable function:

```typescript
export async function getProjectsForUser(
  mainDb: Sql,
  globalUser: GlobalUser,
): Promise<ProjectSummary[]> {
  if (globalUser.isGlobalAdmin) {
    return (
      await mainDb<(DBProject & { last_activity_at: string | null })[]>`
        SELECT p.*, la.last_activity_at
        FROM projects p
        LEFT JOIN (
          SELECT project_id, MAX(timestamp) as last_activity_at
          FROM user_logs
          WHERE project_id IS NOT NULL
          GROUP BY project_id
        ) la ON la.project_id = p.id
        ORDER BY LOWER(p.label)
      `
    ).map<ProjectSummary>((p) => ({
      id: p.id,
      label: p.label,
      thisUserRole: "editor",
      isLocked: p.is_locked,
      status: p.status as ProjectSummary["status"],
      lastActivityAt: p.last_activity_at ?? undefined,
    }));
  }

  return (
    await mainDb<(DBProject & DBProjectUserRole & { last_activity_at: string | null })[]>`
      SELECT pur.*, p.*, la.last_activity_at
      FROM project_user_roles pur
      JOIN projects p ON pur.project_id = p.id
      LEFT JOIN (
        SELECT project_id, MAX(timestamp) as last_activity_at
        FROM user_logs
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      ) la ON la.project_id = p.id
      WHERE pur.email = ${globalUser.email}
      AND (
        pur.can_configure_settings OR pur.can_create_backups OR pur.can_restore_backups OR
        pur.can_configure_modules OR pur.can_run_modules OR pur.can_configure_users OR
        pur.can_configure_visualizations OR pur.can_view_visualizations OR
        pur.can_configure_reports OR pur.can_view_reports OR
        pur.can_configure_slide_decks OR pur.can_view_slide_decks OR
        pur.can_configure_data OR pur.can_view_data OR pur.can_view_metrics OR pur.can_view_logs
      )
      ORDER BY LOWER(p.label)
    `
  ).map<ProjectSummary>((p) => ({
    id: p.id,
    label: p.label,
    thisUserRole: p.role === "editor" ? "editor" : "viewer",
    isLocked: p.is_locked,
    status: p.status as ProjectSummary["status"],
    lastActivityAt: p.last_activity_at ?? undefined,
  }));
}
```

Update `getInstanceDetail` to use this function:

```typescript
// In getInstanceDetail, replace the inline project query with:
const projectSummaries = await getProjectsForUser(mainDb, globalUser);
```

### 5. Server SSE starting message (`server/routes/instance/instance-sse.ts`)

Add `projectsLastUpdated` to the initial state:

```typescript
const instanceState: InstanceState = {
  // ... existing fields ...
  projectsLastUpdated: new Date().toISOString(),
};
```

### 6. Update all notification call sites

**`server/routes/project/project.ts`** - Add import:

```typescript
import { notifyInstanceProjectsLastUpdated } from "../../task_management/notify_instance_updated.ts";
```

**`server/routes/project/project.ts`** - Replace all `notifyInstanceProjectsUpdated(await getAllProjectSummaries(c.var.mainDb))` calls:

```typescript
// Before:
notifyInstanceProjectsUpdated(await getAllProjectSummaries(c.var.mainDb));

// After:
notifyInstanceProjectsLastUpdated(new Date().toISOString());
```

Affected routes:
- `createProject` (line ~73)
- `updateProject` (line ~184)
- `deleteProject` (line ~284)
- `setProjectLockStatus` (line ~302)
- `copyProject` (line ~332, ~337)

**`server/routes/project/project.ts`** - Add notifications to permission routes:

For each of these routes, wrap the return statement to notify on success:

```typescript
// updateProjectUserRole route - change handler to:
async (c, { body }) => {
  console.log("updateProjectUserRole body:", JSON.stringify(body));
  console.log("projectId:", body.projectId, "type:", typeof body.projectId);
  const res = await updateProjectUserRole(
    c.var.mainDb,
    c.var.ppk.projectId,
    body.emails,
    body.role,
  );
  if (res.success) {
    notifyInstanceProjectsLastUpdated(new Date().toISOString());
  }
  return c.json(res);
},

// updateProjectUserPermissions route - change handler to:
async (c, { body }) => {
  const res = await updateProjectUserPermissions(
    c.var.mainDb,
    c.var.ppk.projectId,
    body.emails,
    body.permissions,
  );
  if (res.success) {
    notifyInstanceProjectsLastUpdated(new Date().toISOString());
  }
  return c.json(res);
},

// bulkUpdateProjectUserPermissions route - change handler to:
async (c, { body }) => {
  const res = await bulkUpdateProjectUserPermissions(
    c.var.mainDb,
    c.var.ppk.projectId,
    body.emails,
    body.permissions,
  );
  if (res.success) {
    notifyInstanceProjectsLastUpdated(new Date().toISOString());
  }
  return c.json(res);
},

// addProjectUserRole route - change handler to:
async (c, { body }) => {
  const res = await addProjectUserRole(
    c.var.mainDb,
    c.var.ppk.projectId,
    body.email,
  );
  if (res.success) {
    notifyInstanceProjectsLastUpdated(new Date().toISOString());
  }
  return c.json(res);
},
```

**`server/routes/instance/users.ts`** - Add import:

```typescript
import { notifyInstanceProjectsLastUpdated } from "../../task_management/notify_instance_updated.ts";
```

**`server/routes/instance/users.ts`** - Add notifications to admin/user routes:

For each of these routes, add `notifyInstanceProjectsLastUpdated` after the existing `notifyInstanceUsersUpdated`:

```typescript
// toggleUserAdmin route - change success block to:
if (resUser.success) {
  notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
  notifyInstanceProjectsLastUpdated(new Date().toISOString());
}
return c.json(resUser);

// batchUploadUsers route - change success block to:
if (res.success) {
  notifyInstanceUsersUpdated(await getInstanceUsers(c.var.mainDb));
  notifyInstanceProjectsLastUpdated(new Date().toISOString());
}
return c.json(res);
```

### 7. Client store (`client/src/state/instance/t1_store.ts`)

Add to initial state:

```typescript
const [instanceState, setInstanceState] = createStore<InstanceState>({
  // ... existing fields ...
  projectsLastUpdated: "",
});
```

Add setter:

```typescript
export function updateProjectsLastUpdated(lastUpdated: string): void {
  setInstanceState("projectsLastUpdated", lastUpdated);
}
```

### 8. Client server action (`client/src/server_actions/index.ts`)

Add to `index.ts` (where `_SERVER_HOST` and `tryCatchServer` are already in scope):

```typescript
import type { ProjectSummary } from "lib";

export async function fetchMyProjects(): Promise<APIResponseWithData<ProjectSummary[]>> {
  return tryCatchServer<APIResponseWithData<ProjectSummary[]>>(
    `${_SERVER_HOST}/my_projects`,
    { method: "GET", credentials: "include" }
  );
}
```

Note: `tryCatchServer` doesn't support external abort signals (it creates its own internal controller). The AbortController in the effect still serves a purpose - we check `controller.signal.aborted` before updating state, so stale responses are ignored even though the network request completes.

### 9. Client SSE handler (`client/src/state/instance/t1_sse.tsx`)

Update imports:

```typescript
import { on } from "solid-js";
import { fetchMyProjects } from "~/server_actions";
import {
  // ... existing imports ...
  updateProjectsLastUpdated,
} from "./t1_store";
```

Update message handler - remove old case, add new:

```typescript
// Remove:
case "projects_updated":
  updateInstanceProjects(msg.data);
  break;

// Add:
case "projects_last_updated":
  updateProjectsLastUpdated(msg.data);
  break;
```

Add effect to `InstanceSSEBoundary`:

```typescript
export function InstanceSSEBoundary(props: { children: JSX.Element }) {
  onMount(() => connectInstanceSSE());
  onCleanup(() => disconnectInstanceSSE());

  // Refetch projects when version changes
  // defer: true skips initial run (starting message already has correct projects)
  // AbortController tracks staleness - tryCatchServer doesn't support external abort,
  // but we check aborted flag before updating state to ignore stale responses
  createEffect(on(
    () => instanceState.projectsLastUpdated,
    () => {
      const controller = new AbortController();
      onCleanup(() => controller.abort());

      fetchMyProjects().then((res) => {
        if (controller.signal.aborted) return; // Ignore stale response
        if (res.success) {
          updateInstanceProjects(res.data);
        } else {
          console.error("Failed to fetch projects:", res.err);
          // User sees stale project list - acceptable degradation
        }
      });
    },
    { defer: true }
  ));

  return (
    // ... existing JSX ...
  );
}
```

### 10. Remove dead code

Delete `getAllProjectSummaries` from `server/db/instance/instance.ts` if no longer used.

Remove `notifyInstanceProjectsUpdated` import from files that used it.

### 11. Register route

Add to `lib/api-routes/instance/instance.ts` in `instanceRouteRegistry`:

```typescript
import type { ProjectSummary } from "../../types/mod.ts";

// Add to instanceRouteRegistry:
getMyProjects: route({
  path: "/my_projects",
  method: "GET",
  response: {} as ProjectSummary[],
}),
```

## Documentation update

Update `DOC_STATE_MGT_INSTANCE.md`, section on per-connection fields:

**Before:**
> **Per-connection fields:** `currentUserEmail`, `currentUserApproved`, `currentUserIsGlobalAdmin`, and `currentUserPermissions` are per-user — each SSE connection receives its own values in the `starting` message. On `users_updated`, the client re-derives them by finding the current user in the updated list. All other T1 fields are identical across all clients.

**After:**
> **Per-connection fields:** Some T1 fields are per-user rather than global:
>
> | Fields | Sent in `starting` | Updated on | Update mechanism |
> |--------|-------------------|------------|------------------|
> | `currentUserEmail`, `currentUserApproved`, `currentUserIsGlobalAdmin`, `currentUserPermissions` | Per-user values | `users_updated` | Re-derived by finding current user in broadcast list |
> | `projects`, `projectsLastUpdated` | Per-user values | `projects_last_updated` | Client fetches `/my_projects` (can't re-derive because broadcast can't contain every user's project list) |
>
> All other T1 fields are identical across all clients.

Also update the T1 table to show `projects_last_updated` instead of `projects_updated`:

| Data | Fields on `InstanceState` | SSE event | Version key for T2 caches |
| --- | --- | --- | --- |
| Projects | `projects`, `projectsLastUpdated` | `projects_last_updated` | — |

## Notes

- `updateProjectUserRole` can REMOVE users from projects when `role = "none"` (does `DELETE FROM project_user_roles`). This is covered by the notification.
- `deleteUser` cascade-deletes `project_user_roles` entries (ON DELETE CASCADE in schema). No notification needed since deleted user won't be online.
- Failed `/my_projects` fetch logs error but user sees stale list - acceptable graceful degradation.

## Testing checklist

**Initial load:**

- [ ] Global admin sees all projects on initial load
- [ ] Non-admin sees only permitted projects on initial load

**Admin status changes:**

- [ ] Toggling user's `isGlobalAdmin` updates their project list
- [ ] Batch uploading users with admin status changes updates project lists

**Project access changes:**

- [ ] Adding user to project (`addProjectUserRole`) updates their project list
- [ ] Removing user from project (`updateProjectUserRole` with role="none") updates their project list
- [ ] Updating user's project permissions updates their project list
- [ ] Bulk updating project permissions updates affected users' project lists
- [ ] User has project access → admin removes ALL their permissions via `updateProjectUserPermissions` → project disappears from their list
- [ ] User added with `addProjectUserRole` but with zero permissions (all false) → should NOT see project in list

**Project CRUD:**

- [ ] Creating project updates all users' project lists appropriately
- [ ] Deleting project updates all users' project lists appropriately
- [ ] Renaming project updates all users' project lists
- [ ] Locking/unlocking project updates all users' project lists

**Edge cases:**

- [ ] No memory leak: navigate away during fetch, no errors
- [ ] Rapid permission changes (3+ in quick succession) don't cause race conditions or stale data
- [ ] `batchUploadUsers` with `replace_all_existing: true` updates all online users' lists
- [ ] Server restart during client wait → client handles SSE reconnection and gets fresh data via `starting` message
