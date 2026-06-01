# Protocols

Strict conventions for building apps with panther. These documents get synced to
consumer apps and serve as the authoritative source for AI and human developers.

## Purpose

1. **Single source of truth** — Rules live here, not duplicated in app CLAUDE.md
   files
2. **AI guidance** — Structured for scanning and strict compliance
3. **Audit capability** — Checkable items enable automated validation
4. **Consistency** — Same patterns across all apps using panther

## Naming

Files are named `PROTOCOL_<SCOPE>_*.md`, where `<SCOPE>` is the audience:

- `PROTOCOL_UI_*` — frontend only (scope: UI)
- `PROTOCOL_DENO_*` — backend only (scope: Deno)
- `PROTOCOL_ALL_*` — universal (scope: All)

The prefix matches the in-file `**Scope:**` header and the `@protocol` list the
file appears in (UI → `mod.ui.ts`, Deno → `mod.deno.ts`, All → both). To point a
tool or person at the frontend rules, glob `PROTOCOL_UI_*` plus the
`PROTOCOL_ALL_*` files (which always apply).

Distinguish from:

- `DOC_*.md` — Panther library internals (how panther works)
- `PLAN_*.md` — Temporary implementation plans

Protocols are permanent, prescriptive documents about how to build apps.

## Scope

Each protocol declares its scope:

| Scope | Synced to | Applies when |
|-------|-----------|--------------|
| **UI** | `mode: "ui"` or `mode: "both"` | Building SolidJS frontends |
| **Deno** | `mode: "deno"` or `mode: "both"` | Building Deno servers/scripts |
| **All** | All modes | Universal conventions (TypeScript, structure, sizing, translation) |

Scope is declared in the protocol header and determines which consumer apps
receive it during sync.

## Protocol List

| Protocol | Scope | Content |
|----------|-------|---------|
| `PROTOCOL_ALL_TYPESCRIPT.md` | All | Coding conventions, function style, types, error handling |
| `PROTOCOL_ALL_STRUCTURE.md` | All | File organization, imports, panther integration |
| `PROTOCOL_ALL_SIZING.md` | All | Figure/page sizing: DUs, resolution, shrink-to-fit |
| `PROTOCOL_ALL_TRANSLATION.md` | All | TranslatableString, t3/resolveTS, language handling |
| `PROTOCOL_UI_SOLIDJS.md` | UI | Reactivity rules, component declaration, control flow |
| `PROTOCOL_UI_STATE.md` | UI | timQuery, timAction*, StateHolderWrapper patterns |
| `PROTOCOL_UI_STYLING.md` | UI | Tailwind theme, semantic colors, ui-* utilities |
| `PROTOCOL_UI_COMPONENTS.md` | UI | Using the panther component library |
| `PROTOCOL_DENO_API.md` | Deno | Hono patterns, route structure, validation |

## Protocol Structure

Every protocol follows this structure:

```markdown
# Protocol: [Name]

**Scope:** UI | Deno | All

## Rules

Numbered list of 5-15 rules. Each rule is one line. This section is the TL;DR
that AI scans first.

1. **[Rule name]** — [one-line description]
2. **[Rule name]** — [one-line description]

## Do / Don't

Explicit code examples showing right and wrong. Grouped by topic.

### [Topic]

\`\`\`tsx
// ❌ DON'T
[bad code example]

// ✅ DO
[good code example]
\`\`\`

**Why:** [one sentence explaining the rationale]

## Patterns

Canonical implementations for common scenarios. More detailed than Do/Don't.

### [Pattern name]

[Description and code example]

## Checklist

Machine-readable items for auditing. Each item should be verifiable by
grep/AST analysis or manual review.

- [ ] [Auditable statement]
- [ ] [Auditable statement]
```

### Structure Rationale

- **Rules** — Fast scanning, instant reference
- **Do/Don't** — No ambiguity, visual code comparison
- **Why** — Enables judgment calls on edge cases (brief, not essays)
- **Patterns** — Complete examples for copy-paste
- **Checklist** — Enables future automated auditing

## Writing Guidelines

### Be Prescriptive

Protocols are laws, not suggestions. Use "always", "never", "must" — not
"consider", "prefer", "try to".

```markdown
// Good
**Never use createResource** — triggers Suspense, causes full-page reloads

// Bad
Consider avoiding createResource when possible
```

### Rules First, Explanation Second

AI scans top-to-bottom. Put rules before rationale. One sentence of "why" is
enough — protocols aren't tutorials.

### Code Over Prose

Show, don't tell. A code example communicates more than a paragraph.

### Keep Scope Tight

Each protocol covers one domain. Don't combine unrelated concerns. If a protocol
grows beyond ~500 lines, consider splitting.

### No Duplication

If a rule belongs in one protocol, don't repeat it in another. Cross-reference
instead:

```markdown
See PROTOCOL_ALL_TYPESCRIPT.md for function declaration rules.
```

## Sync Integration

The sync CLI (`cli/copy.ts`) copies protocols to consumer apps based on mode:

```
protocols/
├── PROTOCOL_ALL_TYPESCRIPT.md    → All modes
├── PROTOCOL_ALL_STRUCTURE.md     → All modes
├── PROTOCOL_ALL_SIZING.md        → All modes
├── PROTOCOL_ALL_TRANSLATION.md   → All modes
├── PROTOCOL_UI_SOLIDJS.md        → UI, Both
├── PROTOCOL_UI_STATE.md          → UI, Both
├── PROTOCOL_UI_STYLING.md        → UI, Both
├── PROTOCOL_UI_COMPONENTS.md     → UI, Both
└── PROTOCOL_DENO_API.md          → Deno, Both
```

Protocols land in `panther/protocols/` in consumer apps, alongside the module
code. The authoritative per-mode list is the `@protocol` comments in
`modules/mod.ui.ts` and `modules/mod.deno.ts`.

## Consumer App Integration

After protocols exist, consumer app CLAUDE.md files should reference them
rather than duplicating rules:

```markdown
# My App

## Protocols

This project follows panther protocols. See `panther/protocols/`:

- PROTOCOL_ALL_*.md — Universal conventions (TypeScript, structure, sizing, translation)
- PROTOCOL_UI_*.md — Frontend: SolidJS, state, styling, components

## App-Specific

[Only architecture and decisions unique to this app]
```

This eliminates duplication and ensures a single source of truth.

## Relationship to Existing Docs

| Document | Location | Purpose | Protocols replace? |
|----------|----------|---------|-------------------|
| `DOC_CODING_CONVENTIONS.md` | panther root | TypeScript style (long-form) | Summarized by `PROTOCOL_ALL_TYPESCRIPT.md` |
| `FRONTEND_STYLE_GUIDE.md` | (removed) | SolidJS patterns | Replaced by `PROTOCOL_UI_*` |
| `DOC_*.md` (panther) | panther root | Library internals | No — different purpose |
| `DOC_*.md` (apps) | app roots | App-specific systems | No — app-specific |
| `CLAUDE.md` (apps) | app roots | Architecture + conventions | Partially — remove duplicated rules |

## Future: Audit Tool

A planned `audit.ts` script will:

1. Parse checklist items from protocol files
2. Run checks against consumer app code (grep, AST analysis)
3. Report violations with file:line references

This enables validating that existing apps conform to protocols, not just new
code.

## Versioning

Protocols don't use semantic versioning. They're living documents that evolve
with panther. Breaking changes should be:

1. Announced in commit messages
2. Applied to all consumer apps in the same sync

Since protocols sync alongside panther modules, consumers always get the current
version.
