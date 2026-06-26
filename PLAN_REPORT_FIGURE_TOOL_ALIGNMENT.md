# PLAN — Align report figure AI-tools with slide-deck figure tools

Status: **READY TO IMPLEMENT.** All review done up front; the steps below are
mechanical (mostly reuse of the shipped slide-deck core). No open design
questions remain — the one fork (commit model) is settled in §3.

This is **Phase 3** of [PLAN_SLIDE_REPORT_FIGURE_EDITING.md](PLAN_SLIDE_REPORT_FIGURE_EDITING.md)
(reports), now actionable because Phase 1 (slide decks) shipped and was
browser-verified (commit `0d952a5d`). It supersedes that doc's sketchy Appendix A.

---

## 1. The gap (reports vs slides today)

The slide editor got two figure capabilities that the report editor never did:

| | Slide editor (good) | Report editor (today) |
|---|---|---|
| **Read** | `get_slide_editor` prints each figure's full config — active replicant, available replicant values, display slots, filters ([format_figure_config_for_ai.ts](client/src/components/project_ai/ai_tools/tools/_internal/format_figure_config_for_ai.ts)) | `get_report_editor` prints only `figure:<id>` ([report_editor.ts:184](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L184)) — the AI is blind to what a figure shows |
| **Edit in place** | `update_figure(blockId, patch)` — patches config, re-queries, origin-agnostic ([slide_editor.tsx:350-442](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L350-L442)) | none — only `replace_figure`, which swaps in a **whole new** `from_metric`/`from_visualization` chart, mints a new id, and resets the replicant to the viz default ([report_editor.ts:341-403](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L341-L403)) |

Goal: give reports a `get_figure` + `update_figure` that behave like the slide
tools, reusing the already-shipped core.

## 2. What already exists (so this is small)

Nothing in the patch/resolve/validate core needs to be built — it was shipped
slide-agnostic in Phase 1 and is exported from `~/generate_visualization/mod`:

- `applyFigureConfigPatch(config, patch, periodOption)` — pure config patch ([mod.ts:8](client/src/generate_visualization/mod.ts#L8))
- `validateDisplaySlots(config, metric, patch)` + `assertNoSlotCollision(config, metric, dateRange)` ([mod.ts:9](client/src/generate_visualization/mod.ts#L9))
- `resolveBundleFromMetricAndConfig(projectId, metric, config)` — re-query → new `FigureBundle` ([mod.ts:7](client/src/generate_visualization/mod.ts#L7))
- `validateMetricInputs(projectId, metricId, filters?, periodFilter?)` ([content_validators.ts:173](client/src/components/project_ai/ai_tools/validators/content_validators.ts#L173))
- `formatFigureConfigForAI(projectId, metric, config)` — the read formatter; already documented as "slide-agnostic (reusable for reports)" ([format_figure_config_for_ai.ts:14-23](client/src/components/project_ai/ai_tools/tools/_internal/format_figure_config_for_ai.ts#L14-L23))

And the report editor **already commits figures by stable id**: `updateFigure(id, block)`
→ `setFigures` → `persistFigures` → `serverActions.updateReportFigures`
([report/index.tsx:590-594](client/src/components/report/index.tsx#L590-L594)). The
interactive figure-widget editors (`handleEdit`, `handleCreate`, `handleSwitch`)
use exactly this path with **no** `editorApi.refresh()` afterward — the live
preview re-renders reactively from the `figures()` signal
([report/index.tsx:698,750,770](client/src/components/report/index.tsx#L750)).

The only genuinely new wiring is exposing that commit on the AI context (§5.B).

## 3. Settled design decisions

1. **Two-tier read (NOT inline-per-figure).** `get_report_editor` lists a cheap
   one-line index per figure (built purely from `bundle.config`, **no fetch**); a
   new `get_figure(figureId)` returns the full `formatFigureConfigForAI` (which
   does a replicant-options fetch) for **one** figure on demand.
   - **Why:** `formatFigureConfigForAI` fires a `getReplicantOptionsFromCacheOrFetch`
     round-trip per *replicated* figure ([format_figure_config_for_ai.ts:54-59](client/src/components/project_ai/ai_tools/tools/_internal/format_figure_config_for_ai.ts#L54-L59)).
     A report with 30+ figures would mean 30+ fetches and ~600-1200 lines of
     mostly-unused config on **every** `get_report_editor` call. Slides inline it
     safely only because a slide holds 1-4 figures. Reports need the drill-down.

2. **Write commits stable-id + direct (NOT new-id / NOT `proposeEdit`).**
   `update_figure` overwrites the figure at the **same id** via the existing
   `updateFigure` path; the `![caption](figure:id)` body token is untouched.
   - **Why not new id (the `replace_figure` pattern):** it churns ids, orphans the
     old figure, and exists only because the accept/reject diff is body-text-only
     ([ReportMarkdownDiff.tsx](client/src/components/report/ReportMarkdownDiff.tsx)) —
     a chart change can't be shown there anyway. A config tweak doesn't change the
     body, so it doesn't belong in the body-diff flow.
   - **Why direct (no accept/reject):** the interactive figure-widget editor
     already commits figure edits directly (live + persist, no diff). An AI
     `update_figure` doing the same is consistent with existing report behavior
     **and** is the true analog of the slide `update_figure` (in-place, live,
     re-query). `replace_figure` stays for "swap to a *different* chart."

## 4. Scope

**In:** `get_report_editor` index rewrite, new `get_figure`, new `update_figure`,
the one context method, the `replace_figure` description pointer, and the
report-mode system-prompt update.

**Out (note, don't bundle):**
- G2 `replace_figure` caption-clobber bug ([PLAN_AI_TOOL_GAPS.md](PLAN_AI_TOOL_GAPS.md) G2) — pre-existing, unrelated; fix separately.
- Retrofitting `get_figure` to slides for symmetry — optional; slides don't need it (low figure count). Skip unless desired.
- Chart-type editing — deliberately not supported on slides either (use `replace_figure`).

---

## 5. Mechanical implementation

### 5.A — `client/src/components/project_ai/types.ts`

Add one method to `AIContextEditingReport` (after `proposeEdit`, [types.ts:110](client/src/components/project_ai/types.ts#L110)).
`FigureBlock` is already imported here.

```ts
  proposeEdit: (proposal: ReportEditProposal) => Promise<{ accepted: boolean }>;
  // Apply a stable-id figure edit straight to the live registry + persist (no
  // body diff — the figure's body token is unchanged). Mirrors the interactive
  // figure-widget editor; used by the update_figure AI tool.
  applyFigureUpdate: (figureId: string, block: FigureBlock) => Promise<void>;
```

### 5.B — `client/src/components/report/index.tsx`

Wire the new method to the existing `updateFigure` inside the `setAIContext({...})`
call (after the `proposeEdit` block, [index.tsx:464-471](client/src/components/report/index.tsx#L464-L471)).
`updateFigure` is a hoisted function declaration in the same component scope, so
referencing it here is fine even though it's defined lower in the file
([index.tsx:590](client/src/components/report/index.tsx#L590)).

```ts
      proposeEdit: (proposal) => {
        // Supersede any unresolved proposal (treat as rejected) before staging.
        settleProposal(false);
        setPendingProposal(proposal);
        return new Promise<{ accepted: boolean }>((resolve) => {
          proposalResolve = resolve;
        });
      },
      applyFigureUpdate: (figureId, block) => updateFigure(figureId, block),
    });
```

No other change here — `updateFigure` already does `setFigures` + `persistFigures`,
and the preview updates reactively (proven by the interactive editors).

### 5.C — `client/src/components/project_ai/ai_tools/tools/report_editor.ts`

**Imports** — extend the existing top imports:

```ts
import {
  AiFigureBlockInputSchema,
  AiFigureConfigPatchSchema,
  getReplicateByProp,
  type FigureBlock,
  type MetricWithStatus,
} from "lib";
import { applyFigureConfigPatch, assertNoSlotCollision, resolveBundleFromMetricAndConfig, validateDisplaySlots } from "~/generate_visualization/mod";
import { validateMetricInputs } from "../validators/content_validators";
import { formatFigureConfigForAI } from "./_internal/format_figure_config_for_ai";
```

**Module-level helper** (add near the other top-level functions, e.g. after
`insertFigureToken`):

```ts
// One cheap index line per figure for get_report_editor — pure, no fetch.
function formatFigureIndexLine(id: string, fig: FigureBlock): string {
  if (!fig.bundle) return `- figure:${id} — (no data)`;
  const cfg = fig.bundle.config;
  const parts = [`figure:${id}`, fig.bundle.metricId, cfg.d.type];
  if (cfg.t.caption) parts.push(`"${cfg.t.caption}"`);
  const replicateBy = getReplicateByProp(cfg);
  if (replicateBy) {
    parts.push(`replicant ${replicateBy}=${cfg.d.selectedReplicantValue ?? "(unset)"}`);
  }
  return `- ${parts.join(" · ")}`;
}
```

**`get_report_editor` handler** — replace the single `## Figures:` line
([report_editor.ts:184](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L184))
with the index. Change the handler body's return assembly:

```ts
        const figs = ctx.getFigures();
        const figureIds = Object.keys(figs);
        const imgIds = Object.keys(ctx.getImages());
        const sel = ctx.getSelection();
        const selectionSection = sel && !sel.empty
          ? [
            ``,
            `## User's current selection (lines ${sel.fromLine}-${sel.toLine})`,
            sel.text,
          ]
          : [`## User's current selection: none (cursor at line ${sel?.fromLine ?? 1})`];
        const figureSection = figureIds.length
          ? [
            `## Figures (call get_figure for full config; update_figure to edit in place):`,
            ...figureIds.map((id) => formatFigureIndexLine(id, figs[id])),
          ]
          : [`## Figures: none`];
        return [
          `# REPORT EDITOR: ${ctx.reportLabel}`,
          ``,
          `## Current body (markdown)`,
          ctx.getBody(),
          ``,
          ...figureSection,
          `## Images: ${imgIds.length ? imgIds.map((id) => `image:${id}`).join(", ") : "none"}`,
          ...selectionSection,
        ].join("\n");
```

**New `get_figure` tool** — add to the returned tools array (e.g. right after
`get_report_editor`):

```ts
    createAITool({
      name: "get_figure",
      description:
        "Get the FULL configuration of one report figure: its metric, type, "
        + "disaggregations, filters, the active replicant and the AVAILABLE "
        + "replicant values, display slots, captions, and the metric's available "
        + "dimensions. Call this before update_figure to see what a figure shows "
        + "and which replicant/filter values are valid. figureId is the id after "
        + "'figure:' in get_report_editor.",
      inputSchema: z.object({
        figureId: z.string().describe("Figure id from get_report_editor (the part after 'figure:')."),
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_report") {
          throw new Error("This tool is only available when editing a report");
        }
        const fig = ctx.getFigures()[input.figureId];
        if (!fig?.bundle) {
          const ids = Object.keys(ctx.getFigures()).join(", ") || "(none)";
          throw new Error(`No figure with id "${input.figureId}". Figure ids: ${ids}.`);
        }
        const metric = metrics.find((m) => m.id === fig.bundle!.metricId);
        return await formatFigureConfigForAI(projectId, metric, fig.bundle.config);
      },
      inProgressLabel: "Reading figure...",
      completionMessage: "Read figure",
    }),
```

**New `update_figure` tool** — add to the array (e.g. after `get_figure`). This
is the slide handler's exact core sequence ([slide_editor.tsx:404-423](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L404-L423)),
committed via the report context:

```ts
    createAITool({
      name: "update_figure",
      description:
        "Edit an existing report FIGURE in place — THE tool for changing anything "
        + "about a figure already embedded in the report (the replicant, filters, "
        + "disaggregation, period, captions), regardless of how it was created. "
        + "Provide the figureId (from get_report_editor) and only the fields to "
        + "change; everything else is preserved and the data is re-queried "
        + "automatically. To CHANGE A REPLICANT, use this — it validates the value "
        + "against the available options and errors clearly. The chart TYPE cannot "
        + "be changed here (use replace_figure to swap in a different chart). The "
        + "change is applied to the live preview and saved immediately; the "
        + "figure's body token is unchanged (no accept/reject diff).",
      inputSchema: z.object({
        figureId: z.string().describe("Figure id from get_report_editor (the part after 'figure:')."),
        patch: AiFigureConfigPatchSchema,
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_report") {
          throw new Error("This tool is only available when editing a report");
        }
        const fig = ctx.getFigures()[input.figureId];
        if (!fig?.bundle) {
          const ids = Object.keys(ctx.getFigures()).join(", ") || "(none)";
          throw new Error(`No figure with id "${input.figureId}". Figure ids: ${ids}.`);
        }
        const bundle = fig.bundle;
        const metric = metrics.find((m) => m.id === bundle.metricId);
        if (!metric) {
          throw new Error(`Metric "${bundle.metricId}" not found in this project.`);
        }

        // Validate UP FRONT (a throw must mean "nothing changed"); commit once valid.
        const newConfig = applyFigureConfigPatch(
          bundle.config,
          input.patch,
          metric.mostGranularTimePeriodColumnInResultsFile,
        );
        validateDisplaySlots(newConfig, metric, input.patch);

        const filters = newConfig.d.filterBy.length > 0 ? newConfig.d.filterBy : undefined;
        const periodFilter = newConfig.d.periodFilter?.filterType === "custom"
          ? { min: newConfig.d.periodFilter.min, max: newConfig.d.periodFilter.max }
          : undefined;
        await validateMetricInputs(projectId, bundle.metricId, filters, periodFilter);

        const newBundle = await resolveBundleFromMetricAndConfig(projectId, metric, newConfig);
        assertNoSlotCollision(newConfig, metric, newBundle.dateRange);

        await ctx.applyFigureUpdate(input.figureId, { type: "figure", bundle: newBundle });
        return `Updated figure ${input.figureId}. The preview is updated and saved.`;
      },
      inProgressLabel: "Updating figure...",
      completionMessage: "Updated figure",
    }),
```

**`replace_figure` description** — append a pointer (mirrors how
`update_slide_editor` redirects, [slide_editor.tsx:134](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L134)).
Add to the end of the existing description string ([report_editor.ts:343-344](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L343-L344)):

```
 To merely TWEAK an existing figure (its replicant, filters, disaggregation, period, or captions) WITHOUT changing the underlying chart, use update_figure instead — replacing here rebuilds the figure and resets settings like the replicant.
```

### 5.D — `client/src/components/project_ai/build_system_prompt.ts`

Update `getEditingReportInstructions` ([build_system_prompt.ts:375-396](client/src/components/project_ai/build_system_prompt.ts#L375-L396)):

1. Add to **Primary Tools**:
   ```
   **get_figure** - Read one figure's full config (replicant, available values, slots) before editing it.
   **update_figure** - Edit a figure in place (replicant, filters, disaggregation, period, captions). Applied live + saved.
   ```
2. Add a carve-out to **How editing works** (the current text says *every* edit is
   staged as a diff — `update_figure` is the exception):
   ```
   - **Figure edits are different from text edits.** update_figure applies straight to the live preview and saves — it is NOT staged as a diff (the figure's body token doesn't change). Body/text edits and figure inserts ARE staged for accept/reject.
   ```

---

## 6. Behavior parity & edge cases (already handled by the shared core)

- **Strict replicant validation.** `resolveBundleFromMetricAndConfig` throws with
  the valid-value list on a bad/empty `selectedReplicantValue` — identical to slides
  and `from_metric`. The AI re-patches.
- **Validate-before-commit.** All throws (`validateDisplaySlots`,
  `validateMetricInputs`, resolve, `assertNoSlotCollision`) happen before
  `applyFigureUpdate`, so a failure means the figure is untouched.
- **`from_visualization` figures.** Editable iff their `bundle.metricId` is a
  currently-installed metric (else a clean "Metric not found" throw) — same
  contract as slides; that's also exactly when the figure is re-resolvable.
- **Caption ambiguity.** `patch` touches `config.t.caption` only; the markdown
  token alt-text (`![caption](figure:id)`) is a separate field and is left alone
  (stable id → token untouched). No body rewrite, so no caption collision.
- **`config.s` (style).** Preserved — `applyFigureConfigPatch` spreads `...config`.

## 7. Verify

1. `deno task typecheck` (client + server).
2. Browser, editing a report with ≥1 replicated figure:
   - `get_report_editor` → shows the one-line index incl. `replicant <dim>=<val>`; no full-config dump.
   - `get_figure(id)` → full config + available replicant values.
   - `update_figure(id, { selectedReplicantValue })` → preview updates live, persists; reload confirms it stuck.
   - `update_figure` with a bad replicant value → clear error listing valid values; figure unchanged.
   - `update_figure` with `caption`/`filterBy`/`periodFilter` → applies; body markdown (and token) unchanged.
3. Confirm a report with many figures: `get_report_editor` stays cheap (no per-figure replicant fetch).

## 8. File-change checklist

- [ ] `types.ts` — add `applyFigureUpdate` to `AIContextEditingReport` (§5.A).
- [ ] `report/index.tsx` — wire `applyFigureUpdate` → `updateFigure` in `setAIContext` (§5.B).
- [ ] `report_editor.ts` — imports + `formatFigureIndexLine` helper + `get_report_editor` index + `get_figure` tool + `update_figure` tool + `replace_figure` description pointer (§5.C).
- [ ] `build_system_prompt.ts` — list the two new tools + the figure-edit carve-out (§5.D).
- [ ] Typecheck + browser-verify (§7).
