# CROSS — UI Conventions

> **Phase 1 stub** (PLAN_DOC_CONSOLIDATION §4). A cross-cutting doc, not a
> system: page patterns and design tokens that every client feature system
> (S10, S11, S12, S14) follows. Owns no files in the manifest — it is convention,
> not code ownership. Prose ported in Phase 2 from the docs below.

## Docs absorbed (Phase 2)

- [DOC_DESIGN_SYSTEM](DOC_DESIGN_SYSTEM.md) — page patterns A–E, theme tokens (`client/src/app.css`), `client/src/FRONTEND_STYLE_GUIDE.md`
- [DOC_BUILD_INSTRUCTIONS](DOC_BUILD_INSTRUCTIONS.md) — build/page-construction patterns

## Applies to

S10 (Figure Rendering), S11 (Viz Authoring), S12 (Documents & Sharing), S14
(Client Shell). The shell (S14) owns the design-token *files* (`app.css`,
style guide); this doc captures the *conventions* those systems share.

Note: `panther/protocols/PROTOCOL_UI_*` is the cross-project base layer these
conventions build on — synced from panther, out of scope here.
