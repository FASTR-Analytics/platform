# Plan: Add SlideDeckConfig (equivalent to ReportConfig) + logos on CoverSlide

## Context

The old report system has `ReportConfig` (deck-level theming: colorTheme, logos, watermark, overlay, etc.) and cover logos. The new slide deck system has neither. We need equivalency so the same settings modal can be reused.

Currently:
- `convertSlideToPageInputs` hardcodes `slideDeckStyle` with white backgrounds, no logos, no watermark, no overlay
- `CoverSlide` has no `logos` field
- `SlideDeckDetail` has no config/theming
- The old report system's `getStyle_SlideDeck(reportConfig, reportItemConfig)` dynamically builds styles from `ReportConfig.colorTheme`

## Changes

### 1. Add `SlideDeckConfig` type in `lib/types/slides.ts`

Reuse `ReportConfig` directly (or alias it). The fields are identical to what we want:
- `label`, `logos`, `logoSize`, `colorTheme`, `overlay`, `useWatermark`, `watermarkText`, `showPageNumbers`, `figureScale`, `headerSize`, `footer`, `selectedReplicantValue`

Decision: **Reuse `ReportConfig` as-is** via type alias `SlideDeckConfig = ReportConfig`. Same type, shared modal. No new type needed.

### 2. Add `logos` to `CoverSlide` type in `lib/types/slides.ts`

```ts
export type CoverSlide = {
  type: "cover";
  title: string;
  subtitle?: string;
  presenter?: string;
  date?: string;
  logos?: string[];  // <-- add
};
```

### 3. DB migration: add `config` column to `slide_decks` table

New migration `008_slide_deck_config.sql`:
```sql
ALTER TABLE slide_decks ADD COLUMN IF NOT EXISTS config text;
```

Stored as JSON string (same pattern as reports). Nullable — if null, use defaults via `getStartingConfigForReport(label)`.

### 4. Update `DBSlideDeck` type

Add `config: string | null` to `server/db/project/_project_database_types.ts`.

### 5. Update `SlideDeckDetail` type in `lib/types/slides.ts`

Add `config: ReportConfig` field. Server fills from DB (or defaults if null).

### 6. Server: add `updateSlideDeckConfig` DB function + route

In `server/db/project/slide_decks.ts`:
- `updateSlideDeckConfig(projectDb, deckId, config)` — same pattern as `updateReportConfig`

In `server/routes/project/slide_decks.ts`:
- New PUT route `/slide-decks/:deck_id/config`

In `lib/api-routes/project/slide-decks.ts`:
- Register the new route

### 7. Update `getSlideDeckDetail` to return config

Parse config JSON or return defaults. In `server/db/project/slide_decks.ts`.

### 8. Update `createSlideDeck` and `duplicateSlideDeck` to handle config

- `createSlideDeck`: store default config
- `duplicateSlideDeck`: copy config from source deck

### 9. Client: wire config into slide deck component

In `client/src/components/slide_deck/index.tsx`:
- Store `deckConfig` signal from `getSlideDeckDetail` response
- Add settings button that opens `ReportSettings` modal (reused from report)
- The `ReportSettings` component needs minor refactoring: extract save action as a prop (currently hardcoded to `serverActions.updateReportConfig`). Pass a `saveConfig` callback instead.

### 10. Client: add logos editor to cover slide editor

In `client/src/components/slide_deck/slide_editor/editor_panel_cover.tsx`:
- Add logo selector (same pattern as report cover: choose from deck-level logos)
- Need deck config passed down (or fetched) to know available logos

### 11. Client: update `convertSlideToPageInputs` to accept config

Currently hardcodes style. Needs to:
- Accept `ReportConfig` (deck config) as parameter
- Use `getStyle_SlideDeck(config, ...)` for dynamic theming OR build a simpler style from config
- Pass logos, overlay, watermark to `PageInputs`

This affects:
- `convertSlideToPageInputs` in `client/src/components/slide_deck/utils/convert_slide_to_page_inputs.ts`
- `exportSlideDeckAsPdfVector` in `client/src/export_report/export_slide_deck_as_pdf_vector.ts`
- `exportSlideDeckAsPptxWithImages` in `client/src/export_report/export_slide_deck_as_pptx_with_images.ts`
- `SlideCard` rendering in `client/src/components/slide_deck/slide_card.tsx`

## File change summary

| File | Change |
|---|---|
| `lib/types/slides.ts` | Add `logos` to `CoverSlide`, add `config: ReportConfig` to `SlideDeckDetail`, add `SlideDeckConfig` alias |
| `lib/types/reports.ts` | No change (reuse `ReportConfig`) |
| `server/db/migrations/project/008_slide_deck_config.sql` | New: `ALTER TABLE slide_decks ADD COLUMN config text` |
| `server/db/project/_project_database_types.ts` | Add `config: string \| null` to `DBSlideDeck` |
| `server/db/project/slide_decks.ts` | Update `getSlideDeckDetail`, `createSlideDeck`, `duplicateSlideDeck`; add `updateSlideDeckConfig` |
| `server/routes/project/slide_decks.ts` | Add PUT `/slide-decks/:deck_id/config` route |
| `lib/api-routes/project/slide-decks.ts` | Register `updateSlideDeckConfig` route |
| `client/src/components/slide_deck/index.tsx` | Add config signal, settings button |
| `client/src/components/slide_deck/slide_editor/editor_panel_cover.tsx` | Add logos selector |
| `client/src/components/report/report_settings.tsx` | Refactor: accept generic save callback instead of hardcoded `serverActions.updateReportConfig` |
| `client/src/components/slide_deck/utils/convert_slide_to_page_inputs.ts` | Accept config param, use dynamic styles |
| `client/src/export_report/export_slide_deck_as_pdf_vector.ts` | Fetch and pass deck config |
| `client/src/export_report/export_slide_deck_as_pptx_with_images.ts` | Fetch and pass deck config |
