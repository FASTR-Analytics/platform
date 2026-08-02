# PLAN: year-granularity period filters — verify the claim, then rule

Status: **REVIEW NEEDED, claim unverified.** Raised by an adversarial review
(2026-08-03) of the AI inert-patches work. The query engine has been stable
for a long time, so this plan's FIRST job is to adversarially verify the
claim itself — the reviewer may be overlooking something. Do not fix
anything before the verification step settles what is actually true.

## The claim

`getPeriodFilterExactBounds`
([lib/get_fetch_config_from_po.ts:123-127](lib/get_fetch_config_from_po.ts#L123-L127)):
when the data's format is `year`, EVERY non-`custom` filter type
early-returns `{min: max, max}` — the latest year only. The `from_month`
branch below it is unreachable for annual data.

If true, two exposures — neither deployed today:

1. **AI-authored `from_month` on a year-granularity metric.** The open-ended
   `periodFilter {min?, max?}` (viz editor since results-runs; the two
   figure tools since the inert-patches branch) stores `from_month` legally,
   the read-back says "from X to present", the figure renders the latest
   year only. AI-only: the human period dropdown offers year data just
   "Last year" / "Custom" ([_2_filters.tsx:244-254](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L244)).
2. **Granularity drift.** A `from_month`/`last_n_months` filter authored
   while the metric was monthly, surviving a module re-run that switches the
   results file to annual. Pre-existing IF real. Note the function's own
   quarter_id carve-out comment rules "degrade to all data is the safe
   reading" for exactly this drift class — the year branch, if the claim
   holds, contradicts that ruling.

## Why skepticism is warranted — check these before believing

- **"Last year" is the only relative option the UI offers for year data, and
  `{min: max, max}` is exactly what "Last year" means.** Every
  human-reachable state may be correct by construction — which would explain
  the long stability and shrink the issue to the AI paths only.
- The drift scenario may be impossible or self-healing: does anything reset
  or migrate `periodFilter` when a module re-run changes the metric's time
  column? Has any authored module ever actually changed granularity?
- Do any real instances even hold a year-granularity metric with a
  non-custom filter? (Read-only check against a prod backup, per
  "debug stored data empirically".)
- The reviewer's trace may be wrong somewhere — verify by executing, not
  reading: a ten-line harness over `getPeriodFilterExactBounds` with
  year-format bounds × each filter type settles the engine half decisively.

## Review steps

1. Execute `getPeriodFilterExactBounds` over year-format bounds for every
   filter type; record actual outputs here.
2. If the collapse is real: enumerate every path that can store a
   non-custom filter onto a year metric (UI, all three AI tools, create
   paths, drift) and mark each reachable-today / results-runs-only /
   hypothetical.
3. Rule, then fix or close:
   - Confirmed → (a) AI boundary: reject an open-ended `periodFilter` when
     the metric's granularity is `year`, with a teachable error — this
     piece should land before results-runs ships, since that rollout is
     what makes the state reachable; (b) engine: decide whether the `year`
     early-return should become type-aware (`last_calendar_year` keeps the
     latest-year collapse; drift arrivals degrade to full bounds, matching
     the quarter_id precedent). (b) is a semantics change to stable code —
     it needs its own justification, not just consistency.
   - Refuted → record the refutation here in one paragraph, then delete
     this plan.
4. Either way, add a year-fixture rig case pinning whichever semantics is
   ruled (the current rig covers monthly `from_month` only).
