# PLAN — reference docs: one list/read pair over one catalog (fold `get_info` into the methodology-docs tools)

Status: planned 2026-08-19, not ruled, not built. High-level by design —
detail the file list when ruled. Delete when shipped and SYSTEM_13 carries
the ruling.

## Smell (Tim 2026-08-19)

`get_info` and `get_methodology_docs_list` / `get_methodology_doc_content`
are the same tool shape — list reference documents, read one — split by
where the file lives (app bundle `client/public/info/` vs the GitHub
methodology repo). That is an implementation fact, not a model-facing
distinction. Three tools do one job; on `/mcp` `get_info` is a whole tool
for one file (`iceh`), which is irrelevant when the pinned package holds no
ICEH data.

## Design

- **One catalog, one pair.** `get_reference_docs` lists every reference
  document the surface exposes — the app-maintained topics (today `iceh`,
  plus the SPA-only equity-profile recipe) and the GitHub methodology
  chapters — as `{ id, title, description }`; entries the model must load
  before a task carry that in their description ("load before …").
  `get_reference_doc({ id })` reads any of them; the resolver picks the
  source. The catalog is assembled by the surface from two inputs, exactly
  as topics are today: the app topics it exposes (`INFO_TOPICS` /
  `SPA_INFO_TOPICS`) plus the methodology TOC.
- **Relevance by data, not surface.** `/mcp` filters app topics by what the
  package holds (`grounding.datasets` — no ICEH dataset → no `iceh` entry).
  Same topics-as-input mechanism, no new seam.
- **Overview shrinks.** The "# Reference documentation" section becomes one
  line pointing at `get_reference_docs`; the list tool is the catalog.
- **Naming.** "reference" replaces "info" everywhere the model sees it;
  "methodology" survives only inside entry titles.
- **`/mcp` = 5 tools**: `get_overview`, `get_available_metrics`,
  `get_metric_data`, `get_reference_docs`, `get_reference_doc`.

## Not in scope

- Folding document content into `get_overview` or `get_available_metrics`
  (large, conditional; would ride every conversation).
- Changing where the files live or how the GitHub docs are fetched.

## Footprint (for sizing only)

`lib/ai_tools/tools_info.ts` + `tools_methodology_docs.ts` → one file;
`build_system_prompt.ts` (both), `mcp_tools.ts`, `mcp_endpoint.ts`,
`headless_app.ts` (raw `/info` allow stays), `client_info_topics.ts`, SPA
prompt mentions, USER_GUIDE_MCP, SYSTEM_13, `mcp_probe` examples. No
schema, data or cache changes.

## Verification

`./mcp_probe local --list` → 5 tools; `get_reference_docs` lists methodology
chapters and (only when the package has ICEH data) `iceh`;
`get_reference_doc` reads one of each source; `get_overview` has no topic
list; `grep -rn get_info lib client/src server` → 0.
