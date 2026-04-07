# Project-Level State Management

**This is a placeholder.** Project-level state management will be redesigned in Phase 2 of the SSE migration (see `PLAN_SSE_STATE_MANAGEMENT.md`).

## Current architecture (pre-Phase 2)

Project state currently uses a Context/Provider pattern, unlike instance state which uses a global store:

| Concern | File |
| --- | --- |
| Types | `lib/types/project_dirty_states.ts` |
| Server notifications | `server/task_management/notify_last_updated.ts` |
| Server SSE endpoint | `server/routes/project/project-sse.ts` |
| Client state + SSE | `client/src/components/project_runner/provider.tsx` (combined) |
| Non-reactive access | `client/src/components/project_runner/global_pds.ts` |

This will be refactored in Phase 2 to match the instance-level pattern (global store, separate SSE connection manager, no Context/Provider).
