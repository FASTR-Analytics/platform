# PLAN — AI tool gaps (triage backlog)

Status: DRAFT / backlog. Findings-only — no implementation. Output of a read-only
audit (2026-06-24) hunting the bug *class* behind the slide-figure replicant bug.
The replicant fix itself lives in
[PLAN_SLIDE_REPORT_FIGURE_EDITING.md](PLAN_SLIDE_REPORT_FIGURE_EDITING.md); this
doc captures everything *else* the audit surfaced so it isn't lost.

## The pattern (one root cause)

Every gap below is the same shape:

> The AI's **read-projections** (`simplifySlideForAI`, `get_report_editor`, the
> `_internal/format_*_for_ai.ts` list formatters) and its **write-schemas**
> (`lib/types/ai_input.ts` `Ai*Schema`) were each designed around a minimal
> "title / text / figure-data" mental model, while the stored shapes
> (`Slide` / `ContentBlock` / `FigureBundle` / `PresentationObjectConfig`) are far
> richer. Anywhere **stored shape > (read projection ∪ write schema)**, the AI
> can set things it can't read, read things it can't edit, or must blind-guess.

Fix principle (applies everywhere): **drive the read-projection and the
write-schema from the stored schema.** That's exactly what the figure plan does
for the figure slice; these items apply the same principle to other slices.

The figure/replicant slice is **excluded** here (covered by the other plan). The
audit confirmed that plan's scope is right and these findings do **not** change
its core — they validate building it.

---

## Tier 0 — Real production bugs (not AI-ergonomics; fix independently, small)

### G1 — Text-block `style` silently destroyed on any AI text edit  [HIGH, real bug]
`getSlideWithUpdatedBlocks` replaces the whole block with the new content, which
carries no `style`, so a user's `textSize` / `textBackground` vanishes whenever the
AI edits that text (e.g. fixes a typo).
- Stored: `TextBlock = { type, markdown, style?: { textSize?, textBackground? } }`
  ([slides.ts:213-217](lib/types/slides.ts#L213-L217)).
- Bug: [get_slide_with_updated_blocks.ts:31](client/src/components/slide_deck/slide_ai/get_slide_with_updated_blocks.ts#L31)
  (`updateMap.set(blockId, newContent)`) — whole-block replace.
- Write schema also can't set it: `AiTextBlockSchema` is `{ type, markdown }` only
  ([ai_input.ts:63-79](lib/types/ai_input.ts#L63-L79)).
- **Fix:** merge `style` from the existing block on edit (don't replace); longer
  term, let the schema carry `style`. A few lines; no plan dependency.

### G2 — `replace_figure` caption clobber on duplicate-embedded ids  [MED, real bug]
The caption-override regex is global, so if one figure id is embedded twice with
different captions, a single `caption` override rewrites **both**.
- [report_editor.ts:378-385](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L378-L385).
- **Fix:** scope the rewrite to the targeted token occurrence, or document that
  override applies to all embeds of that id.

---

## Tier 1 — Systemic gaps (same class; own small plans, after figures)

### G3 — Filter/disaggregation VALUES are undiscoverable for common dimensions  [HIGH]
Highest-impact *new* finding — touches the core query path, not just figures.
- The metric list surfaces dimension **names** but **values** only for ICEH/HFA
  ([format_metrics_list_for_ai.ts:59-93,122-196](client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts#L59)).
  For `admin_area_2/3/4`, `facility_type`, `facility_ownership`,
  `indicator_common_id` (non-HFA), `denominator`, `target_population`, etc., no
  tool returns the valid values.
- The data exists server-side (`disaggregationPossibleValues`,
  [presentation_objects.ts:104-106](lib/types/presentation_objects.ts#L104-L106));
  `validateMetricInputs` already fetches it — but only to *reject* a bad guess
  after the fact ([content_validators.ts:181-195](client/src/components/project_ai/ai_tools/validators/content_validators.ts#L181-L195)).
- Consequence: to set a `filters` array (on `get_metric_data` or a `from_metric`
  block) the AI must guess values and learn valid ones only via validation-error
  strings. This is the replicant "binary-reduction" pattern generalized.
- **Fix direction:** a discovery surface for dimension values — either a
  `get_dimension_values(metricId, disOpt)` tool (lazy, scales) or fold a bounded
  value list into the metric-list formatter. Mirrors the figure plan's
  replicant-options approach. Note: `get_metric_data` already lists values for
  dimensions you *disaggregate* by (capped at 20,
  [format_metric_data_for_ai.ts:276](client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts#L276)) —
  the gap is *filter-only* dimensions.

### G4 — Slide/report STYLE surface is invisible and uneditable  [HIGH as a cluster]
Same root cause as figures, different fields. A coherent follow-on plan.
- **Images**: no image input schema at all — the AI can't create, edit, or read
  image blocks; resolvers reject the type
  ([convert_ai_input_to_slide.ts:87](client/src/components/slide_deck/slide_ai/convert_ai_input_to_slide.ts#L87),
  [slide_editor.tsx:279](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L279)).
  `ImageBlock` carries `imgFile` + `style` ([slides.ts:240-244](lib/types/slides.ts#L240-L244));
  read-back shows only `Image: <imgFile>`
  ([extract_blocks_from_layout.ts:72-73](client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts#L72-L73)).
  Reports have no image tool either, and surface only `image:<id>`.
- **Slide-level style**: cover/section/content carry `footer`, `subHeader`,
  `showLogos`/`showHeaderLogos`/`showFooterLogos`, `split` (left/right panel with
  placement/size/fill), and bold/italic/relFontSize fields
  ([slides.ts:251-296](lib/types/slides.ts#L251-L296)). None are readable or
  settable; create schemas expose only title/subtitle/presenter/date/header
  ([ai_input.ts:183-252](lib/types/ai_input.ts#L183-L252)), and `replace_slide`
  silently wipes the rest.
- **Fix direction:** extend `simplifySlideForAI` + the create/update schemas to
  cover block `style` and slide-level style fields; an image input schema +
  insert/update image verbs. Apply the same "read = write = stored" principle.

---

## Tier 2 — Lower severity (note; fix opportunistically)

- **G5** — Saved-viz list drops `valuesFilter` / period / replicant value
  (`PresentationObjectSummary` omits them,
  [presentation_objects.ts:30-43](lib/types/presentation_objects.ts#L30-L43)) →
  degrades the AI's clone-vs-build decision. [MED]
- **G6** — `get_metric_data` hard-codes `includeAdminAreaRollup: false`
  ([format_metric_data_for_ai.ts:76-97](client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts#L76-L97)),
  so explored data differs from a roll-up-enabled figure, with the disclosure
  living in a different tool's formatter. [MED]
- **G7** — `update_slide_editor` silently ignores fields not matching the slide
  type (e.g. `title` on a content slide) — no error
  ([slide_editor.tsx:129-167](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L129-L167)). [LOW]
- **G8** — Complex (non-3×3) layouts read back as `structure: null`
  ([layout_spec_helpers.ts:120-124](client/src/components/slide_deck/slide_ai/layout_spec_helpers.ts#L120-L124));
  only `replace_slide` (destructive rebuild) can edit them. [LOW]
- **G9** — `get_available_modules` reduces `dirty:"error"` to the bare word
  "Error" with no message, and still shows `metricCount`; remediation needs a
  separate `get_module_log` call the list doesn't hint at. [LOW]
- **G10** — `get_module_settings` formats only `parameterSelections`, omitting
  other `ModuleConfigSelections` fields the tool description implies. [LOW]
- **G11** — `sanitizeCaption` silently strips brackets/newlines from report
  captions with no feedback (mangles e.g. "95% CI [0.4, 0.6]"). [LOW]
- **G12** — three slide-tool descriptions tell the AI to display tabular data via
  "from_metric with `chartType='table'`", but `AiFigureFromMetricSchema` has **no
  `chartType` field** — the table is selected via a table-type `vizPresetId`. Zod
  strips the unknown key, so the AI can silently get a non-table figure when it
  asked for a table. Pre-existing; inconsistent with the (correct) text-block
  schema hint that says "use a table preset". Fix = replace
  "with `chartType='table'`" → "with a table-type preset (`vizPresetId`)" in
  [slides.tsx:152](client/src/components/project_ai/ai_tools/tools/slides.tsx#L152),
  [slides.tsx:202](client/src/components/project_ai/ai_tools/tools/slides.tsx#L202),
  [slide_editor.tsx:133](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L133). [LOW] **(FIXED 2026-06-24, all 3 spots → "table-type preset (vizPresetId)")**

---

## Sequencing

These do **not** block or alter the figure plan — proceed with decks → reports
there first. Recommended order for this backlog:

1. **G1** (text-style drop) and **G2** (caption clobber) — standalone bug fixes,
   anytime; small.
2. **G3** (filter-value discoverability) — its own small plan after figures;
   highest new user-impact.
3. **G4** (slide/report style surface) — follow-on plan applying the figure
   principle to style.
4. Tier 2 — opportunistic.

This backlog is also the **spine of SYSTEM_13 (AI assistant) in
PLAN_DOC_CONSOLIDATION.md**: organize that doc around the
"read-projection = write-schema = stored-shape" principle and inventory every AI
tool against it. Write SYSTEM_13 *after* the figure work proves the principle out
— documenting the surface before restructuring it would be stale on arrival.
