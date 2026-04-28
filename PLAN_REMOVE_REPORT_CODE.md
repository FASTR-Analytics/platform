# Plan: Remove Report Code

Reports have been replaced by Slide Decks. This plan covers removing all report-related code.

## Prerequisites
- Confirm all report → slide migrations are complete
- Backup any reports data if needed

---

## Phase 1: Delete Dedicated Report Files

### Server
- [ ] `server/routes/project/reports.ts` - API routes
- [ ] `server/db/project/reports.ts` - DB functions

### Client
- [ ] `client/src/components/project/add_report.tsx`
- [ ] `client/src/components/project/migrate_reports_to_slides.tsx`
- [ ] `client/src/components/instance/migrate_project_reports.ts`
- [ ] `client/src/components/instance/migrate_all_reports_to_slides.tsx`
- [ ] `client/src/state/caches/reports.ts`

### Lib
- [ ] `lib/types/reports.ts`
- [ ] `lib/api-routes/project/reports.ts`

---

## Phase 2: Remove Report References from Shared Files

### Server - DB
- [ ] `server/db/project/mod.ts` - remove `export * from "./reports.ts"`
- [ ] `server/db/project/projects.ts` - remove `getAllReportsForProject` import and usage
- [ ] `server/db/project/_project_database_types.ts` - remove report table types

### Server - Task Management
- [ ] `server/task_management/build_project_state.ts` - remove report-related state
- [ ] `server/task_management/get_project_dirty_states.ts` - remove report dirty states
- [ ] `server/task_management/notify_project_v2.ts` - remove report notifications
- [ ] `server/task_management/set_module_clean.ts` - remove report references

### Server - Routes
- [ ] `server/routes/project/presentation_objects.ts` - check for report references

### Lib - Types
- [ ] `lib/types/mod.ts` - remove report exports
- [ ] `lib/types/projects.ts` - remove `reports` from ProjectDetail
- [ ] `lib/types/permissions.ts` - remove `can_configure_reports` permission
- [ ] `lib/types/permission_labels.ts` - remove report permission labels
- [ ] `lib/types/project_dirty_states.ts` - remove report dirty state types
- [ ] `lib/types/project_sse.ts` - remove report SSE events

### Lib - API Routes
- [ ] `lib/api-routes/combined.ts` - remove report routes

### Client - Components
- [ ] `client/src/components/project/index.tsx` - remove report UI/tabs
- [ ] `client/src/components/project/project_decks.tsx` - check for report references
- [ ] `client/src/components/project/project_settings.tsx` - remove report settings
- [ ] `client/src/components/project_runner/provider.tsx` - remove report state/fetching
- [ ] `client/src/components/instance/instance_settings.tsx` - remove report settings
- [ ] `client/src/components/instance/pending_deletions.tsx` - remove report deletions

### Client - State
- [ ] `client/src/state/t4_ui.ts` - remove report UI state
- [ ] `client/src/state/t4_connection_monitor.ts` - remove report SSE handling
- [ ] `client/src/state/po_cache.ts` - check for report references

### Client - Server Actions
- [ ] `client/src/server_actions/try_catch_server.ts` - remove report actions

---

## Phase 3: Database Migration

- [ ] Create migration to drop `reports` and `report_items` tables
- [ ] Remove report-related columns from other tables if any

---

## Phase 4: Cleanup

- [ ] Run typecheck: `deno task typecheck`
- [ ] Test slide deck functionality still works
- [ ] Remove any orphaned imports

---

## Files with "report" that are NOT about Reports feature

These mention "report" in different contexts (e.g., "reporting", error reporting) - DO NOT DELETE:
- `server/module_loader/compare_definitions.ts` - "reporting" facilities
- `server/module_loader/language_map_content.ts` - translation strings
- `server/routes/project/emails.ts` - email reporting
- `server/worker_routines/*` - progress reporting
- `client/src/components/forms_editors/confirm_update.tsx` - UI text
- `client/src/components/instance_dataset_hmis_import/step_3.tsx` - "reporting" rate
- `lib/translate/language_map_content.ts` - translation strings
