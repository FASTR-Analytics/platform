# Translation Migration Instructions

## Goal

Migrate all translation calls in `<TARGET_DIR>` from the old `t()` / `t2(T.Section.key)` system to inline `t3({ en: "...", fr: "..." })` calls (or `t3(TC.key)` for common strings), AND wrap any obvious untranslated UI text.

## Reference files (READ THESE FIRST)

- `lib/translate/language_map_ui.ts` — Map of English -> French for `t()` lookups
- `lib/translate/ui_strings.ts` — `T` object with `{ en, fr }` entries for `t2(T....)` lookups
- `lib/translate/common.ts` — `TC` object with common shared translations
- `lib/translate/t-func.ts` — `t3()` function definition

## For each `.ts` / `.tsx` file in `<TARGET_DIR>`:

### Step 1: Migrate existing `t()` calls

For each `t("...")` call:

- If a `TC` constant matches the English string exactly, replace with `t3(TC.key)`.
- Otherwise, look up the English string in `language_map_ui.ts`. Replace with `t3({ en: "English", fr: "French" })`.
- If no French translation exists in the Map, translate it yourself. This is a World Bank data analytics platform (FASTR). Use professional, concise French appropriate for a technical UI. Replace with `t3({ en: "English", fr: "Your French translation" })`.

### Step 2: Migrate existing `t2(T....)` calls

For each `t2(T.Section.key)` call:

- If a `TC` constant has the same `en` value, replace with `t3(TC.key)`.
- Otherwise, look up the `en` and `fr` in `ui_strings.ts`. Replace with `t3({ en: "...", fr: "..." })`.

### Step 3: Migrate existing `t2("...")` calls

String passed directly to `t2` — same logic as Step 1.

### Step 3b: Migrate existing `t2({ en, fr })` calls

If a file already has inline `t2({ en: "...", fr: "..." })` calls, change `t2` to `t3`. The object shape is the same.

### Step 4: Wrap unwrapped UI text

Find obvious user-visible English strings that aren't wrapped in any translation call. These include:

**a) Text content inside JSX elements:**

```tsx
// Before:
<span>Project is currently locked</span>
// After:
<span>{t3({ en: "Project is currently locked", fr: "Le projet est actuellement verrouillé" })}</span>
```

**b) Raw text as JSX children (e.g. button labels):**

```tsx
// Before:
<Button>Download</Button>
// After:
<Button>{t3(TC.download)}</Button>
```

**c) String literals in `label`, `header`, `headerText`, `heading`, `placeholder`, `noRowsMessage`, `selectionLabel`, `text` props/properties when they contain user-visible English:**

```tsx
// Before:
{ label: "View reports", key: "can_view_reports" }
// After:
{ label: t3({ en: "View reports", fr: "Voir les rapports" }), key: "can_view_reports" }

// Before:
noRowsMessage="No users found"
// After:
noRowsMessage={t3({ en: "No users found", fr: "Aucun utilisateur trouvé" })}
```

**d) Fallback content in `<Show>` and similar:**

```tsx
// Before:
<Show when={data()} fallback={<div>Loading backups...</div>}>
// After:
<Show when={data()} fallback={<div>{t3({ en: "Loading backups...", fr: "Chargement des sauvegardes..." })}</div>}>
```

**e) Template literals with user-visible text:**

```tsx
// Before:
`${count} backup(s) available`
// After:
t3({ en: `${count} backup(s) available`, fr: `${count} sauvegarde(s) disponible(s)` })
// For template literals, always provide the French translation too.
```

**Do NOT wrap:**

- CSS class names, route paths, API endpoints, query parameters
- Object keys, enum values, technical identifiers
- Props like `intent="primary"`, `size="sm"`, `iconName="trash"`
- `console.log` / `console.error` messages
- Error messages in `throw` statements or `{ err: "..." }` responses
- Variable names or string constants used as programmatic identifiers
- Strings that are already wrapped in `t3()`
- `key`, `id`, `class`, `type`, `method`, `name` (when used as HTML/form attributes)

### Step 5: Update imports

- Remove `t` from imports if no longer used in the file.
- Remove `T` from imports if no longer used in the file.
- Add `TC` to imports if used: `import { t3, TC } from "lib"` (match the existing import path style).
- Add `t3` to imports (add it if it wasn't there before).
- Keep `t2` imported if it's still used elsewhere in the file.
- Match the existing import path style in each file (some use `"lib"`, check what the file already does).

### Step 6: Typecheck after every file

After finishing each file, run:

```bash
cd /Users/timroberton/projects/_1_WEB_APPS/wb-fastr && deno task typecheck
```

This checks both the server (`deno check main.ts`) and client (`cd client && npm run typecheck`). If it fails:

- Read the error output carefully.
- Fix the type errors in the file you just edited.
- Re-run the typecheck until it passes.
- Only then move on to the next file.

Do NOT batch multiple files before typechecking. One file at a time.

### Step 7: Do NOT change

- Calls to `isFrench()`, `setLanguage()`, `getCalendar()` — leave alone.
- Server-side code or module definitions — leave alone.
- Anything that isn't a UI-visible string.

## Formatting

- Do not add comments.
- Match existing code style.
- Do not reformat lines you didn't change.

## Translation guidelines

- This is a World Bank data analytics platform (FASTR). Use professional, concise French appropriate for a technical UI.
- Use existing translations in `language_map_ui.ts` and `ui_strings.ts` as a style reference for consistency.
- Keep translations concise — match the brevity of the English where possible.
- For domain-specific terms (e.g. "admin area", "indicator", "slide deck"), check `language_map_ui.ts` for established translations before inventing new ones.

## After migrating all files

List any translations you were uncertain about so they can be reviewed.

## Example full transformation

```tsx
// BEFORE:
import { t, t2, T } from "lib";

<Button onClick={handleCancel}>{t("Cancel")}</Button>
<Button>{t2(T.FRENCH_UI_STRINGS.save)}</Button>
<SettingsSection header={t2(T.FRENCH_UI_STRINGS.settings)}>
  <span>Project is currently locked</span>
</SettingsSection>
<Table noRowsMessage={t("No users")} selectionLabel="user" />

// AFTER:
import { t3, TC } from "lib";

<Button onClick={handleCancel}>{t3(TC.cancel)}</Button>
<Button>{t3(TC.save)}</Button>
<SettingsSection header={t3(TC.settings)}>
  <span>{t3({ en: "Project is currently locked", fr: "Le projet est actuellement verrouillé" })}</span>
</SettingsSection>
<Table noRowsMessage={t3({ en: "No users", fr: "Aucun utilisateur" })} selectionLabel={t3({ en: "user", fr: "utilisateur" })} />
```

## Tracking progress

- Files using `t(` or `t2(` → not yet migrated
- Files using only `t3(` → migrated
- `grep -r "t(" --include="*.tsx" | grep -v "t3(" | grep -v "import"` — to find remaining work
