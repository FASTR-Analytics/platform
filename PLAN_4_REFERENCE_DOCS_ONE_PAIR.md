# PLAN_4: one list/read pair over one reference catalog

`get_info` and `get_methodology_docs_list` / `get_methodology_doc_content` are
the same tool shape, list reference documents and read one, split by where the
file lives: the app bundle (`client/public/info/`) or the GitHub methodology
hub. That is an implementation fact, not a model-facing distinction. Three tools
do one job, and on `/mcp` `get_info` is a whole tool for one file. This plan
replaces them with `get_reference_docs` and `get_reference_doc`.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. Last step: 1. The session that passes step
1's review deletes this file.

Branch: `main`. Repos touched: this app; the resource hub's prompt library
(`fastr-resource-hub`, `prompts.md` and `prompts_fr.md`) after every instance
runs the release (§7).

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md),
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md),
[USER_GUIDE_MCP.md](USER_GUIDE_MCP.md).

## 0. How to work this plan

[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) binds this plan, with one
override: the branch is `main`, because Tim commits to the current branch and
`main` is the release branch. Instruction: "Do the next step of
PLAN_4_REFERENCE_DOCS_ONE_PAIR.md." Floor as the protocol lists it; the AI tool
schema rules of PROTOCOL_APP_AI_TOOLS apply; no migration, query engine or help
text is touched. Build log: §8.

## 1. The problem

- Three tools, one job: `lib/ai_tools/tools_info.ts` (lists on no argument,
  reads on `topic`) and `lib/ai_tools/tools_methodology_docs.ts` (fetches the
  hub's `index.md` as a table of contents, reads one file). Each surface passes
  its topic list to the tool and to the prompt's "Reference documentation"
  section, where the per-topic "load before" triggers live.
- On `/mcp` the app catalog is `iceh` alone, whether or not the instance holds
  ICEH data.
- The hub is read unauthenticated at call time, with no cache, under GitHub's 60
  requests per hour per IP, which the server's `/mcp` shares across every
  connector.
- The hub's `index.md` is a curated table that lags its directory (8 of 12
  chapters), and `fr/` and `pt/` mirror it.
- The hub's prompt library, which the SPA fetches live, names the methodology
  tools by their current names.

## 2. The model

One catalog, one pair. `get_reference_docs` lists every reference document the
surface exposes; `get_reference_doc({ id })` reads one, the resolver picking the
source by id. The catalog is text assembled per surface: the app entries it is
given, one line each with the entry's trigger in its description, then the hub's
index for the instance language verbatim, with one line saying its link targets
are ids. An app entry may declare the dataset it is about, and the builder drops
it when the instance holds no such data. The list tool's description is composed
from the entries it is given, so the triggers are visible before the first call,
and the prompt's section becomes one line. The hub is read through an in-process
memo with a time to live, and a hub failure degrades the list to the app entries
plus one line. `/mcp` ends with five tools.

## 3. Rulings

1. Two tools, `get_reference_docs` and `get_reference_doc`, replace three on
   every surface. "reference" replaces "info" everywhere the model sees it;
   "methodology" survives only inside the hub's own text.
2. The catalog is text, not parsed entries: app lines, then the hub index
   verbatim. No parser against the hub's table.
3. Relevance by instance data, on both surfaces: an entry declares its
   `dataset`, and the builder filters by `datasetsWithData`
   (`resolveInstanceState` on `/mcp`, which is ungated and needs no pin;
   `instanceState` in the SPA). The hub chapters declare none.
4. The hub index is the instance language's (`fr/`, `pt/` when present, else
   English); ids are hub paths; the read accepts any guarded path under the hub,
   since the index omits chapters.
5. Hub reads are memoised per process with a time to live, and the list degrades
   per source. This is in scope because the merge makes the app entries depend
   on the hub call.
6. Triggers ride the entries: `iceh` gets "load before analysing ICEH survey
   data", the SPA's equity recipe keeps its own, the list tool's description
   names the entries, and the prompt keeps one line pointing at the list tool.
7. The rename is a tool rename and nothing else: no schema, data or cache
   change. A stored conversation's call to an old name fails once with "Unknown
   tool" and the model re-lists; a connected MCP client keeps its cached tool
   list until it refreshes, which USER_GUIDE_MCP states.

## 4. Steps

### Step 1: the pair

**Surface.** `lib/ai_tools/` (`tools_info.ts` and `tools_methodology_docs.ts`
become one file; `info_catalog.ts`, `build_system_prompt.ts`,
`copilot_catalogue.ts`, `mod.ts`), `client/src/components/instance/`
(`copilot_tools.ts`, `copilot/build_system_prompt.ts`,
`copilot/client_info_topics.ts`, `copilot/mod.ts`), `client/public/info/iceh.md`
and `iceh-equity-profile.md` (they name the tool), `server/mcp/mcp_tools.ts` and
`mcp_endpoint.ts`, `server/headless_app.ts` and
`server/middleware/headless_allowlist.ts` (comments),
`server/tests/copilot_catalogue_test.ts`, `copilot_prompt_test.ts` and
`methodology_docs_decode_test.ts` (the last renamed with its line in SYSTEM_13's
`globs`), USER_GUIDE_MCP.md, SYSTEM_13, SYSTEM_08 (one mention).

**Deliverable.** Rulings 1 to 7 in the code. The three tests green.
`./mcp_probe local --list` prints five tools. A word-bounded grep for the three
old names over the repo, excluding `panther/` and `node_modules/`, finds
nothing. USER_GUIDE_MCP and SYSTEM_13 describe the pair.

**Not in this step.** Changing where the files live or how the hub is fetched
beyond the memo. The hub's prompt library (§7).

**Gates.** The floor; `./mcp_probe local --list` after `./run`.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                                    | First reached |
| --------------------------------------- | ------------- |
| `deno task typecheck`                   | step 1        |
| `deno task test`                        | step 1        |
| `./validate_protocols`                  | step 1        |
| `./run` then `./mcp_probe local --list` | step 1        |

## 6. Out of scope

- Folding document content into `get_overview` or `get_available_metrics`.
- Changing where the files live.

## 7. Rollout and rollback

Ships with the next release through `./deploy`. After every instance runs it,
the hub's `prompts.md` and `prompts_fr.md` are edited to the new names; until
then a library prompt that names an old tool fails once and the model re-lists.
Rollback is reverting the commit, and the hub edit with it.

## 8. Build log

| When       | Step | Row                                                                                                                                                                                                                                                                                                              |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-19 | 0    | Smell recorded and the pair designed.                                                                                                                                                                                                                                                                            |
| 2026-10-27 | 0    | Rewritten after three independent reviews: ruled; the catalog is text over the hub index; relevance by instance data on both surfaces; hub reads memoised and degraded per source; triggers on the entries and in the list tool's description; the hub prompt library and MCP client cache named in the rollout. |
