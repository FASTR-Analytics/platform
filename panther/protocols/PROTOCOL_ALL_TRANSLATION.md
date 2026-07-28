# Protocol: Translation

**Scope:** All

Panther's translation primitives live in `_000_utils` and are used on both
tiers: UI labels **and** server-rendered text (e.g. figure/period labels in
Deno-built PDFs resolve through the same language global). For sentence case of
UI strings see `PROTOCOL_UI_STYLING.md`.

```typescript
type Language = "en" | "fr" | "pt";
type TranslatableString = { en: string; fr: string; pt?: string };

setLanguage(lang) / getLanguage()   // current language (process-global)
t3(ts): string                      // resolve ts to the current language
resolveTS(ts, lang): string         // resolve ts to an explicit language
```

## Rules

1. **User-facing strings are `TranslatableString`** — `{ en, fr, pt? }`, never a
   bare string literal shown to a user. `en` and `fr` are required; `pt` is
   optional.
2. **Resolve with `t3`** — `t3(ts)` returns the string for the current language.
3. **`t3` takes a `TranslatableString`, not a string** — it is not the app-level
   `t("…")` key helper (see below). Passing a bare string is a type error.
4. **Explicit language → `resolveTS`** — use `resolveTS(ts, lang)` when output
   must be a specific language regardless of the global (e.g. rendering a doc in
   a chosen language).
5. **Missing French/Portuguese falls back to English** — both `t3` and
   `resolveTS` return `ts.en` when the requested language's entry is missing or
   empty. Rely on this; don't pre-check.
6. **Locale formatting via `Record<Language, T>` lookup** — for number/date/
   label _formatting_ differences, define a `..._BY_LANG: Record<Language, T>`
   table and index it with `getLanguage()`; use `t3` for whole translatable
   strings.
7. **Set language once at entry** — call `setLanguage()` at app start or before
   a render pass. The language is a process-global singleton.
8. **One language per process** — you cannot resolve EN and FR concurrently from
   the global; to render both, flip `setLanguage()` between passes or use
   `resolveTS(ts, lang)` with explicit languages.

## Do / Don't

### Translatable strings

```typescript
// ❌ DON'T — hardcoded, untranslatable
const label = "Loading…";

// ✅ DO (pt is optional — falls back to en when omitted)
const label = t3({ en: "Loading…", fr: "Chargement…", pt: "A carregar…" });
```

**Why:** Every user-facing string must exist in English and French (Portuguese
where the app supports it); `t3` is the one resolution point.

### t3 vs the app-level t()

```typescript
// ❌ DON'T — t3 is not a key/string helper
t3("Save");

// ✅ DO — t3 resolves a TranslatableString
t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" });
```

**Why:** Panther provides `t3` over `TranslatableString`. Some apps define their
own `t("key")` over a translation table — that's an app convention, distinct
from `t3`. Don't conflate them.

### Explicit vs ambient language

```typescript
// ✅ Ambient (current global language) — typical case
t3({ en: "Total", fr: "Total" });

// ✅ Explicit language — when the global can't be trusted (e.g. dual-language output)
resolveTS({ en: "Total", fr: "Total" }, "fr");
```

### Formatting branches

```typescript
// ✅ DO — per-language lookup for locale-specific formatting (not whole strings)
const QUARTER_PREFIX_BY_LANG: Record<Language, string> = {
  en: "Q",
  fr: "T",
  pt: "T",
};
const quarter = `${QUARTER_PREFIX_BY_LANG[getLanguage()]}${q}`;
```

**Why:** Formatting differences (separators, quarter/month abbreviations) are
locale logic, not translatable content.

## Patterns

### Set the language at entry

```typescript
// App start, or before a server render pass
setLanguage(
  userLocale === "fr" ? "fr" : userLocale === "pt" ? "pt" : "en",
);
```

### Resolve in UI and on the server

```typescript
// UI label
<Button>{t3({ en: "Apply", fr: "Appliquer" })}</Button>;

// Server-rendered figure title (Deno) — same primitive
const title = t3({ en: "Coverage by region", fr: "Couverture par région" });
```

## Checklist

- [ ] No bare user-facing string literals — all are `TranslatableString`
- [ ] Strings resolved via `t3` (ambient) or `resolveTS` (explicit language)
- [ ] `t3` is called with `{ en, fr, pt? }`, never a bare string
- [ ] `Record<Language, T>` lookups (via `getLanguage()`) used only for
      formatting differences, not whole strings
- [ ] `setLanguage()` called once at entry; no assumption of concurrent
      languages
