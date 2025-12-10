# Plan: Persist AI Reports ("long_form" report type)

## Overview

Add `"long_form"` as a third report type alongside `slide_deck` and `policy_brief`. Long-form reports appear in the Reports list and open in the AI report editor when clicked.

## Design Decisions (Confirmed)

- **Data**: Store markdown only (no AI chat history)
- **Saving**: Auto-save with ~2s debounce
- **Navigation**: Remove "AI Report" from sidebar; long_form reports appear in Reports list and open via `?r=reportId` like other reports
- **Config**: Store markdown in report's JSON config field (no report_items needed)

---

## Implementation Steps

### 1. Types (`lib/types/reports.ts`)

```typescript
// Update union
export type ReportType = "slide_deck" | "policy_brief" | "long_form";

// Add config type
export type LongFormReportConfig = {
  label: string;
  markdown: string;
};

// Add helper
export function getStartingConfigForLongFormReport(label: string): LongFormReportConfig {
  return { label, markdown: "" };
}

// Update get_REPORT_TYPE_SELECT_OPTIONS() and get_REPORT_TYPE_MAP()
```

### 2. API Route (`lib/api-routes/project/reports.ts`)

Add route for updating long_form content:
```typescript
updateLongFormContent: route({
  path: "/long_form_content/:report_id",
  method: "POST",
  params: {} as { report_id: string },
  body: {} as { markdown: string },
  response: {} as { lastUpdated: string },
  requiresProject: true,
}),
```

### 3. Database Function (`server/db/project/reports.ts`)

- Update `addReport()` to use `getStartingConfigForLongFormReport()` when `reportType === "long_form"`
- Add `updateLongFormContent()` function that:
  1. Loads report config
  2. Updates `markdown` field
  3. Saves with new `lastUpdated`
  4. Returns `{ lastUpdated }`

### 4. Server Route (`server/routes/project/reports.ts`)

Add handler for `updateLongFormContent`:
- Auth: `getProjectEditor`
- Call DB function
- Call `notifyLastUpdated()` for cache invalidation

### 5. Report Component (`client/src/components/report/index.tsx`)

Detect `long_form` type and render `ProjectAiReport` instead of standard editor:
```typescript
<Show when={reportDetail.reportType === "long_form"} fallback={/* existing report UI */}>
  <ProjectAiReport
    projectDetail={p.projectDetail}
    reportId={p.reportId}
    backToProject={p.backToProject}
  />
</Show>
```

### 6. AI Report Component (`client/src/components/project_ai_report/index.tsx`)

Major refactor:
- **Props**: Add required `reportId: string` and `backToProject` function
- **Remove**: Module-level signal, "AI Report" standalone behavior
- **Add**:
  - Load markdown from server on mount via `getReportDetail`
  - Component-level state for document content
  - Debounced save (2s) calling `updateLongFormContent`
  - Save indicator in UI ("Saving..." / "Saved")
  - Back button to return to Reports list
- **Keep**: AI chat, tools, PDF/DOCX export

### 7. Project Navigation (`client/src/components/project/index.tsx`)

- **Remove**: "AI Report" tab from sidebar nav
- **Remove**: `"ai_report"` from `TabOption` type
- **Remove**: The `<Match when={tab() === "ai_report"}>` block
- Keep "Reports" tab (long_form reports accessed from there)

### 8. Reports List (`client/src/components/project/project_reports.tsx`)

- No changes needed - already shows all reports by type
- Clicking any report navigates via `?r=reportId`
- The `Report` component handles type detection

---

## Files to Modify

| File | Changes |
|------|---------|
| `lib/types/reports.ts` | Add `long_form` type, `LongFormReportConfig`, helper functions |
| `lib/api-routes/project/reports.ts` | Add `updateLongFormContent` route |
| `server/db/project/reports.ts` | Update `addReport`, add `updateLongFormContent` |
| `server/routes/project/reports.ts` | Add route handler |
| `client/src/components/report/index.tsx` | Detect `long_form` and render `ProjectAiReport` |
| `client/src/components/project_ai_report/index.tsx` | Refactor for persistence |
| `client/src/components/project/index.tsx` | Remove "AI Report" tab |

---

## Edge Cases

1. **Type checking on load**: Verify `reportType === "long_form"` before treating config as `LongFormReportConfig`
2. **Concurrent tabs**: Debounced saves could conflict; acceptable for now
3. **Empty state**: New long_form report starts with empty markdown
4. **Delete/Duplicate**: Existing report operations should work (soft delete, duplication)
5. **Translation**: Add "Long-form report" to translation files
