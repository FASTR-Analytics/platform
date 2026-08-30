# REVIEW REQUEST — is there a better way?

You are a fresh agent. This document is your whole brief.

## Context

FASTR is a health-data analytics platform. Country instances ingest
facility-month HMIS counts; R modules transform them into standalone
"results packages" (parquet + manifest); users chart "metrics" declared by
those modules via a query engine, and assemble the charts into reports,
slides, and dashboards.

Repos:

- App: `/Users/timroberton/projects/apps/wb-fastr` (server = Deno/Hono,
  client = SolidJS, shared `lib/`; `panther/` is an external library — never
  modify it)
- Modules: `/Users/timroberton/projects/apps/wb-fastr-modules` (authored
  module + metric definitions, R scripts)

Orientation: `SYSTEMS.md`, then especially `SYSTEM_05_facilities_indicators.md`,
`SYSTEM_08_results_packages.md`, `SYSTEM_09_viz_query_cache.md`.

## The situation

Read `PLAN_1_COMMON_INDICATOR_TYPES.md` (app repo root). Its goals: fold
calculated indicators into the common-indicator dictionary as typed entries
(base / derived / population rate), evaluate derived indicators at query
time as expressions over aggregated counts, add a first-class population
store, and drop the two scorecard modules — all while old packages keep
rendering.

## The tension

The same semantic ideas now exist at TWO levels that meet on one chart:

- **Per-metric** (authored in the modules repo, frozen into manifests):
  value columns, aggregation funcs, an optional post-aggregation
  expression (e.g. `pct_diff = (a-b)/b`), a display format (`formatAs`).
- **Per-indicator** (authored in the instance dictionary, snapshotted into
  packages): under the plan, an indicator too can carry an expression
  (derived = ratio over other indicators, evaluated post-aggregation), a
  format (`percent`/`number`/`rate_per_10k`), thresholds, sort order.

Expression-over-aggregates, format, thresholds — each concept declared
twice, in two authoring planes, with different lifecycles. And they
collide exactly where the app lives: a chart whose axis is
`indicator_common_id`, where the metric declares how to aggregate the
value column while each row of the axis wants its own expression and
format. The plan glues the two levels together with conditionals:
per-indicator expressions are hosted only when the per-metric machinery is
absent (no metric PAE, all funcs SUM, the RO has an indicator column);
`formatAs: "indicator"` means "the metric delegates format to the
indicator"; and because the fetch wire carries no metric identity (the
engine sees only `resultsObjectId` + a client-compiled `fetchConfig`),
those conditionals must be inferred from request shape. The latest review
round (2026-08-30, code-verified) showed the inference leaking — the
hosting rule also matches eleven unrelated shipped metrics — but that is
one symptom, not the issue.

The plan has been through roughly twenty rounds of review and each round
still surfaces leaks of this kind. I (Tim, sole maintainer) read the
non-convergence, and the two-level gluing itself, as the red flag: the
whole thing smells of complexity in a bad way.

## The question

**Is there a better way to meet the goals of that plan — including by
restructuring the metric system and query system themselves?**

Take a real step back. My goal for this app is: robust, performant, the
simplest possible code. That's it. I am 100% willing to refactor and
reshape big aspects of the app — if the answer is "change the whole metric
system", that is a fine answer. Churn is a cost to price, never a reason
to prefer a lesser design. Past "REJECTED / do not re-litigate" markers in
the PLAN and SYSTEM docs were made under a narrower framing and are
reopened for this question.

And "no — the plan's approach is right, patch it" is also a fine answer,
if that's where the evidence leads.

## Ground rules

- Check against actual code, not doc summaries. Claims with file:line.
- This is a review: report only. Write your answer as a document; make no
  other edits to any repo.
- Don't invent requirements — old packages keeping rendering, standalone
  packages, arbitrary filters etc. are asserted in the docs; if one of
  them is what forces the complexity, say so and flag it as a question for
  me rather than assuming it is immovable.
