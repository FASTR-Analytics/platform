---
system: 13
name: AI Copilot & Usage Governance
globs:
  - client/src/components/project_ai/**
  - client/src/components/slide_deck/slide_ai/build_config_from_metric.ts
  - client/src/components/slide_deck/slide_ai/convert_ai_input_to_slide.ts
  - client/src/components/slide_deck/slide_ai/extract_blocks_from_layout.ts
  - client/src/components/slide_deck/slide_ai/get_deck_summary.ts
  - client/src/components/slide_deck/slide_ai/get_slide_with_updated_blocks.ts
  - client/src/components/slide_deck/slide_ai/layout_spec_helpers.ts
  - client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts
  - client/src/components/slide_deck/slide_ai/resolve_figure_from_visualization.ts
  - client/src/state/project/t4_ai_documents.ts
  - lib/types/ai_input.ts
  - lib/types/custom_prompts.ts
  - server/db/instance/ai_usage_logs.ts
  - server/db/instance/custom_prompts.ts
  - server/routes/instance/custom_prompts.ts
  - server/routes/project/ai_files.ts
  - server/routes/instance/ai_proxy.ts
  - server/routes/project/ai_proxy.ts
  - server/routes/project/ai_tools.ts
docs_absorbed:
  - DOC_AI_PROXY_AND_USAGE_GOVERNANCE
  - DOC_AI_TOOL_SCHEMAS
---
# S13 — AI Assistant & Usage Governance

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S13).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the Anthropic proxy with token-limit governance, plus the browser-side copilot: ~40 client-executed tools mutating via the AIContext contract_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S13).

## Docs absorbed (Phase 2)

- [DOC_AI_PROXY_AND_USAGE_GOVERNANCE](DOC_AI_PROXY_AND_USAGE_GOVERNANCE.md)
- [DOC_AI_TOOL_SCHEMAS](DOC_AI_TOOL_SCHEMAS.md)

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, SYSTEMS.md §5)._
