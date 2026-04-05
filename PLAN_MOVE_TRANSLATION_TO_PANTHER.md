# Plan: Move translation system into panther

## Goal

Move the core translation mechanism (`t3()`, `setLanguage()`, `isFrench()`, `TranslatableString`) into panther so it can be reused across apps and used within panther itself for translatable magic strings.

## What moves to panther

New module: `panther/_000_translate/` (or similar low-numbered module since it has no panther-internal deps)

```ts
// types
export type Language = "en" | "fr";
export type TranslatableString = { en: string; fr: string };

// global state
const _LANGUAGE: { lang: Language } = { lang: "en" };

export function setLanguage(language: Language): void;
export function getLanguage(): Language;
export function isFrench(): boolean;

// core translation function
export function t3(val: TranslatableString): string;
```

## What stays in the app

These are app-specific and stay in `lib/translate/`:

- `InstanceLanguage`, `InstanceCalendar` types (app-level config types)
- `setCalendar()`, `getCalendar()` (maps language → calendar type, app-specific logic)
- `getTextRenderingOptions()` (Ethiopian font fallbacks, app-specific)
- `TC` common strings (app-specific shared translations)
- `translateIndicatorId()` (app-specific indicator label lookup)
- `language_map_content.ts` (server-side module content translations)

The app's `lib/translate/t-func.ts` becomes a thin wrapper that re-exports from panther plus adds the calendar/rendering functions. Or it can just be deleted entirely if the app imports `t3`/`setLanguage` from panther directly.

## Migration steps

### 1. Create the module in panther (in timroberton-panther repo)

- Create `_000_translate/mod.ts` with `Language`, `TranslatableString`, `t3`, `setLanguage`, `getLanguage`, `isFrench`
- Export from `mod.ui.ts` and `mod.deno.ts`
- The `Language` type is `"en" | "fr"` for now — can be expanded later if needed

### 2. Update panther internals (optional, can be incremental)

- Any magic strings in panther components (button labels, fallback text, etc.) can start using `t3()` with inline `{ en, fr }` objects
- This is not blocking — can be done gradually

### 3. Update wb-fastr imports

- Change `lib/translate/types.ts` to re-export `TranslatableString` from panther (or remove and update imports)
- Change `lib/translate/t-func.ts` to:
  - Re-export `t3`, `setLanguage`, `isFrench` from panther
  - Keep `setCalendar`, `getCalendar`, `getTextRenderingOptions` locally
- Or: update all import sites to import translation functions from panther directly, and only import app-specific stuff from `lib`
- `InstanceLanguage` in the app becomes an alias for `Language` from panther (or replaced entirely)

### 4. Update other apps

- Any other app using panther can now use the same `t3()` / `setLanguage()` pattern
- Each app provides its own `TC` common strings and app-specific translation utilities

## Design decisions

**Language type**: `"en" | "fr"` is fine for now. If a third language is ever needed, the `TranslatableString` type and `t3()` would need to change in panther — but that's a deliberate decision point, not something to over-engineer now.

**No `t3` rename**: Keep the name `t3` even in panther. It's already used in hundreds of call sites across wb-fastr. Renaming adds churn with no benefit.

**Singleton pattern**: The global `_LANGUAGE` state is fine for browser SPAs (one language per page load). If panther is ever used in a server-side multi-tenant context, this would need to change to a context-based approach — but that's not the current use case.
