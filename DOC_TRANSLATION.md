# Translation System

## Overview

The app supports English and French. All user-visible strings must be wrapped with `t3()` so they render in the user's selected language.

## Core types and functions (from panther)

The translation system lives in panther's `_000_translate` module. These are re-exported through `lib` for convenience:

- `Language` -- `"en" | "fr"`
- `TranslatableString` -- `{ en: string; fr: string }`
- `t3(val: TranslatableString): string` -- returns the string for the current language (reads global state)
- `resolveTS(val: TranslatableString, lang: Language): string` -- explicit parameter version, used server-side
- `setLanguage(language: Language): void` -- sets the global language (called at app init)
- `getLanguage(): Language` -- returns current language
- `isFrench(): boolean` -- shorthand for `getLanguage() === "fr"`

Panther components (alerts, headings, tables, etc.) translate their own built-in strings internally via `t3()`. No `french` prop is needed.

## Usage

```tsx
import { t3, TC } from "lib";

// Inline translation
t3({ en: "Project is locked", fr: "Le projet est verrouillé" })

// Common string from TC constants
t3(TC.save)  // "Save" / "Sauvegarder"
```

## App-specific files

- `lib/translate/t-func.ts` -- re-exports `t3`, `isFrench`, `setLanguage`, `getLanguage` from panther; defines `setCalendar()`, `getCalendar()`
- `lib/translate/types.ts` -- re-exports `TranslatableString` from panther
- `lib/translate/common.ts` -- `TC` object with shared translations (cancel, save, delete, etc.)

## TC constants

Use `TC.*` for common strings instead of repeating inline objects. Current constants:

`cancel`, `save`, `download`, `delete`, `edit`, `done`, `update`, `settings`, `email`, `national`, `columns`, `rows`, `scale`, `loading`, `loadingFiles`, `loadingAssets`, `fetchingData`, `general`, `label`, `folder`, `goBackToProject`, `mustEnterName`

Add new entries to `lib/translate/common.ts` if a string appears in 3+ places.

## What to wrap

All user-visible text in client components:

```tsx
// JSX text content
<span>{t3({ en: "No data", fr: "Aucune donnée" })}</span>

// Button / link labels
<Button>{t3(TC.save)}</Button>

// Props: label, header, heading, placeholder, noRowsMessage, selectionLabel, text
<Input label={t3({ en: "Project name", fr: "Nom du projet" })} />

// Fallback content
<Show when={data()} fallback={<div>{t3(TC.loading)}</div>}>

// Template literals
t3({ en: `${count} items`, fr: `${count} éléments` })
```

## What NOT to wrap

- CSS classes, route paths, API endpoints, query parameters
- Object keys, enum values, technical identifiers
- Props like `intent="primary"`, `size="sm"`, `iconName="trash"`
- `console.log` / `console.error` messages
- Error messages in `throw` statements or `{ err: "..." }` responses
- `key`, `id`, `class`, `type`, `method`, `name` HTML attributes

## Translation guidelines

- This is a World Bank data analytics platform. Use professional, concise French appropriate for a technical UI.
- Keep translations concise -- match the brevity of the English.
- For domain-specific terms (e.g. "admin area", "indicator", "slide deck"), check existing `t3()` calls in the codebase for established translations before inventing new ones.

## Other translation utilities

- `isFrench()` -- returns `true` if the current language is French. Use for conditional logic (e.g. layout widths), not for string translation.
- `resolveTS(val, lang)` -- used server-side where explicit language parameter is preferred over global state.
- `setLanguage()` / `setCalendar()` -- called at app init. Do not use in components.
- `getCalendar()` -- returns the calendar type. Do not modify.
