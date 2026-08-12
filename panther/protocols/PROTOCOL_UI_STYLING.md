# Protocol: Styling

**Scope:** UI

Tokens, interactive state, spacing, and theming for app code. For the reasoning,
the full token catalog, and the theming mechanics, see
`DOC_UI_COLOR_AND_STATE.md`. For component usage see
`PROTOCOL_UI_COMPONENTS.md`.

## Rules

1. **Token colors only** — `base-100/200/300`, `base-content` (+ `-muted`,
   `-faint`), the five intents (+ `-content`, `-hover`, `-active`, `-subtle`,
   `-subtle-content`), `border`, `focus`, `scrim`. Nothing else.
2. **No arbitrary values** — never `bg-[#ff0000]`, `p-[23px]`, or an inline
   `style` for anything a token covers.
3. **Only declared scale values exist** — the color, radius, shadow and
   font-weight scales are wiped, so an off-scale class is never generated and
   fails silently rather than visibly. `bg-gray-100`, `rounded-lg`, `shadow-md`,
   `font-normal`, `font-medium` and `font-semibold` are all no-ops. Weights are
   `font-400` and `font-700`, plus any the app declares.
4. **Cursor change ⇒ visible state change** — no cursor-only hovers. Two
   exceptions to the background rule: text-only interactives (inline links, tab
   labels) hover on text color; clickable cards (content containers) hover at
   the frame — `cursor-pointer` + `hover:border-primary` (prefer `Card`).
5. **`ui-hoverable-{token}` is the state pattern** — every interactive opaque
   surface uses it. Explicit `hover:`/`active:` pairs only for selectable text
   or a transparent rest. Clickable cards use the frame idiom instead (rule 4).
6. **Never stack `bg-*` on a family-classed element** — the utility wins and
   kills the states. Scope the family per `classList` arm instead.
7. **Declare `onBackground`** — any outline `Button` / `ButtonGroup` not sitting
   on `base-100` must declare the surface token it sits on.
8. **Never write a border color for the default** — bare `border` already paints
   the border token. A border color class always marks an exception.
9. **Side frames own their divider** — `FrameLeft`, `FrameRight`, `FrameBottom`,
   `FrameLeftResizable`, `FrameRightResizable` and `FrameThreeColumnResizable`
   draw the panel/content edge themselves. Never put that edge's border on a
   side-frame panel (or on the panel component's root) — it double-draws. Inner
   dividers on other edges are fine. Pass `noBorder` only when the panel is
   tonal against its content or draws a deliberately non-default border colour.
10. **`-subtle` washes are non-interactive** — never a hover target, never a
    hover destination, never a click target's rest surface. Only exception: the
    pinned surface of a _selected_ selection control.
11. **Controls on washes are filled, not outline** — at the wash's own intent.
12. **Disabled is `opacity-40`** — a treatment, not a color.
13. **Focus is `ui-focusable`** — one focus signal; never a per-intent ring.
14. **Spacing uses `ui-*`** — `ui-pad`, `ui-gap`, `ui-spy` and their `-sm`/`-lg`
    variants, not raw `p-4` / `gap-4` / `space-y-6`.
15. **Size via `size="sm"`** — never ad-hoc classes to resize a control.
16. **Theme with plain `@theme`** — never `@theme inline`, never re-wipe
    `--color-*` app-side.
17. **Sentence case** — all UI text, always.

## Do / Don't

### Colors

```tsx
// ❌ DON'T — off-token palette, arbitrary hex, alpha improvised
<div class="bg-gray-100 text-gray-800">
<div class="bg-[#f5f5f5]">
<div class="bg-primary/10">

// ✅ DO
<div class="bg-base-200 text-base-content">
<div class="bg-primary-subtle text-primary-subtle-content">
```

**Why:** The default Tailwind palette is wiped, so off-token classes render
nothing at all; `-subtle` is the designed opaque wash the `/10` idiom replaced.

### Muted text

```tsx
// ❌ DON'T — neutral is a fill intent, not a text ramp
<span class="text-neutral">Last updated 3h ago</span>;

// ✅ DO
<span class="text-base-content-muted">Last updated 3h ago</span>;
<span class="ui-text-caption">Last updated 3h ago</span>;
```

**Why:** `neutral` is for fills (spinners, badges); the foreground ramp is
`base-content` → `-muted` → `-faint`, and only the ramp inverts correctly on a
dark theme.

### Interactive surfaces

```tsx
// ❌ DON'T — cursor with no surface change
<div class="cursor-pointer" onClick={open}>…</div>;

// ❌ DON'T — utility bg on a family class (utility wins, states die)
<div class="ui-hoverable-base-100 bg-base-100" onClick={open}>…</div>;

// ✅ DO
<div class="ui-hoverable-base-100 ui-pad" onClick={open}>…</div>;
```

**Why:** The family bundles affordance, rest, hover and press as one designed
unit; a stacked utility overrides the rest surface and silently removes the
states.

### Selected states

```tsx
// ❌ DON'T — a wash as the rest surface of a clickable
<button class="bg-primary-subtle cursor-pointer">{label}</button>;

// ✅ DO — pinned wash on the selected arm only, family on the rest
<button
  classList={{
    "border-primary bg-primary-subtle font-700": isSelected(),
    "ui-hoverable-base-100": !isSelected(),
  }}
>
  {label}
</button>;
```

**Why:** A wash reads as "information", not "control"; pinning it to the
selected arm keeps that meaning while the unselected arm keeps the affordance.

### Outline buttons

```tsx
// ❌ DON'T — undeclared backdrop on a non-base-100 surface (paints white)
<div class="bg-base-200 ui-pad">
  <Button outline onClick={edit}>Edit</Button>
</div>;

// ✅ DO
<div class="bg-base-200 ui-pad">
  <Button outline onBackground="base-200" onClick={edit}>Edit</Button>
</div>;
```

**Why:** An outline control is a quiet interactive _of the surface it sits on_;
`onBackground` names that surface so rest, hover and press match it.

### Controls in callouts

```tsx
// ❌ DON'T — outline control on a wash reads as a second wash
<div class="bg-danger-subtle ui-pad rounded border border-danger">
  <Button outline intent="danger">Back</Button>
</div>;

// ✅ DO
<div class="bg-danger-subtle ui-pad rounded border border-danger">
  <Button intent="danger" size="sm">Back</Button>
</div>;
```

**Why:** On a tinted surface only a solid fill still reads as a control.

### Borders

```tsx
// ❌ DON'T
<div class="border border-base-300">
<div class="border border-border">

// ✅ DO — bare border already paints the border token
<div class="border rounded">
<div class="border border-primary rounded">  // only when selected/active
```

**Why:** `@layer base` sets `border-color: var(--color-border)` on every
element, so a written border color is noise unless it marks an exception.

### Elevation

```tsx
// ❌ DON'T
<div class="rounded-lg shadow-md">          // both scales are wiped: no-ops
<div class="ui-pad rounded border shadow-floating">  // in-flow, must not float

// ✅ DO
<div class="ui-pad rounded border">                        // in-flow container
<div class="bg-base-100 rounded border shadow-floating">   // floating surface
```

**Why:** `--radius` and `--shadow-floating` are the whole scale; in-flow
containers are border-only, and shadow means "this left the document flow".

### Spacing

```tsx
// ❌ DON'T
<div class="p-4 gap-3 space-y-6">
<div class="p-[23px]">

// ✅ DO
<div class="ui-pad ui-gap">
<div class="ui-pad-sm ui-gap-sm">
```

**Why:** The `ui-*` utilities resolve through density vars, so an app can retune
its whole density from one `@theme` block.

### Text case

```tsx
// ❌ DON'T
<Button>Save Changes</Button>
<h1>User Settings</h1>

// ✅ DO
<Button>Save changes</Button>
<h1>User settings</h1>
```

## Patterns

### Which token do I reach for

| Situation                                    | Reach for                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Body text                                    | inherited `base-content`                                                                                                 |
| Sublabels, captions, metadata, help text     | `text-base-content-muted` / `ui-text-caption`                                                                            |
| One step quieter still                       | `text-base-content-faint`                                                                                                |
| Text on a solid fill                         | `text-{intent}-content`                                                                                                  |
| Text on a wash                               | `text-{intent}-subtle-content`                                                                                           |
| Disabled anything                            | `opacity-40`                                                                                                             |
| Page background                              | `bg-base-200`                                                                                                            |
| Card / panel on the page                     | `bg-base-100`                                                                                                            |
| Inset or well inside a panel                 | `bg-base-200`                                                                                                            |
| Chip, slider track, filled placeholder       | `bg-base-300`                                                                                                            |
| Divider, tick, scrollbar thumb               | `bg-border`                                                                                                              |
| In-flow container                            | `border rounded` — no color, no shadow                                                                                   |
| Popover, menu, tooltip, modal panel          | `bg-base-100 border rounded shadow-floating`                                                                             |
| Modal backdrop                               | `bg-scrim`                                                                                                               |
| Selected / active border                     | `border-primary`                                                                                                         |
| Error border                                 | `border-danger`                                                                                                          |
| Callout or badge                             | `bg-{intent}-subtle` + `text-{intent}-subtle-content`                                                                    |
| Selected card / option / nav item            | accent select: pinned `bg-primary-subtle` + `border-primary` (+ `font-700` on labels/rows, never on a content container) |
| Multi-select card grid                       | marking select: `Card selected + onSelectToggle` — `border-primary` + circle, no wash                                    |
| Selected row in a dense list                 | fill select: `bg-base-200`                                                                                               |
| Any interactive opaque surface               | `ui-hoverable-{token}`                                                                                                   |
| Clickable card (whole card is the target)    | `Card onClick` — `cursor-pointer` + `hover:border-primary` at the frame                                                  |
| Focus                                        | `ui-focusable`                                                                                                           |
| Main action / secondary action / destructive | `intent="primary"` / `outline` + `onBackground` / `intent="danger"`                                                      |

Status intents: `success` complete/positive · `warning` caution · `danger`
error/destructive · `neutral` running/queued/pending · `primary`
selected/active.

**"I need a new token."** You don't — fix the site. Never add a surface tier, a
lighter wash, or a per-intent focus color for one awkward site. See
`DOC_UI_COLOR_AND_STATE.md`.

### Card with a clickable header

```tsx
<div class="rounded border">
  <div class="ui-hoverable-base-100 ui-pad flex items-center" onClick={toggle}>
    <div class="flex-1">{title}</div>
    <Icon iconName="chevronDown" />
  </div>
  <div class="ui-pad border-t">{body}</div>
</div>;
```

### Status callout with an action

```tsx
<div class="bg-danger-subtle text-danger-subtle-content ui-pad ui-spy-sm rounded border border-danger text-sm">
  <div>{errorMessage}</div>
  <Button intent="danger" size="sm" onClick={retry}>Retry</Button>
</div>;
```

### Selectable card grid

```tsx
<For each={items()}>
  {(item) => (
    <button
      class="ui-pad w-full rounded border text-left"
      classList={{
        "border-primary bg-primary-subtle font-700": isSelected(item),
        "cursor-pointer hover:border-primary": !isSelected(item),
      }}
      onClick={() => select(item)}
    >
      <div>{item.label}</div>
      <div class="ui-text-caption">{item.detail}</div>
    </button>
  )}
</For>;
```

Prefer `Card` (`selected` / `onClick`) for card-shaped sites — it carries the
`border-color` transition and the keyboard/focus wiring for you. The `font-700`
here bolds the option label; a content container pins wash + border without
bolding.

### App theme block

```css
@import "tailwindcss";
@source "./src";
@import "./panther/_303_components/_fixed.css";

@theme {
  /* No --color-*: initial — the kit already wiped the palette, and an
     app-side wipe also nukes the kit's derived state tokens. */
  --color-primary: #6f2e30;
  --color-base-200: #ebebec;
  --color-border: #d6d7d9; /* pin explicitly if you used to theme borders via base-300 */
  --radius: 3px;
}
```

Dark themes additionally override `--color-scrim` (the default 30% black veil
disappears over near-black surfaces). Palette swaps must land on `:root` —
`:root[data-theme="dark"] { … }` — never on a wrapper element.

### The public class API

Usable from app code:

- **Spacing/density:** `ui-pad`, `ui-pad-sm`, `ui-pad-lg`, `ui-pad-x`,
  `ui-pad-x-sm`, `ui-pad-x-lg`, `ui-gap`, `ui-gap-sm`, `ui-gap-lg`, `ui-spy`,
  `ui-spy-sm`, `ui-spy-lg`
- **Form density:** `ui-form-pad`, `ui-form-pad-sm`, `ui-form-text-size`,
  `ui-form-text-size-sm`, `ui-icon-only-correction`,
  `ui-icon-only-correction-sm`
- **State:** the `ui-hoverable-{token}` family — `base-100`, `base-200`,
  `base-300`, `base-content`, `primary`, `neutral`, `success`, `warning`,
  `danger` — and `ui-focusable`
- **Type:** `ui-text-display`, `ui-text-title`, `ui-text-heading`,
  `ui-text-overline`, `ui-text-caption`, `ui-text-small`, `ui-form-text`,
  `ui-label`
- **Skins (only when building a control panther doesn't provide):**
  `ui-fill-{intent}`, `ui-outline-{intent}`

Every other `ui-*` class is internal and may change without notice.

### Public density vars

Retune these in `@theme`; never override a derived one directly.

| Var                                 | Role                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `--ui-form-content-h`               | **Authoring knob.** A control's content height, as a ratio of its own text size. |
| `--ui-form-content-h-em`            | Derived. The same ratio with the unit attached — what components consume.        |
| `--ui-form-line-height` / `-sm`     | Derived from the ratio.                                                          |
| `--ui-form-height` / `-sm`          | Derived. A control's full outer height; what `HeadingBar` floors its row to.     |
| `--ui-heading-bar-tonal-bg` / `-fg` | **Authoring knob (a pair).** The one tonal header surface.                       |

The ratio is deliberately shared across sizes — `em` rescales it, so there is no
`--ui-form-content-h-sm`. Overriding `--ui-form-height` or
`--ui-form-line-height` directly desyncs a heading bar from the controls sitting
in it; change the ratio instead. Retune the heading-bar pair together: the
foreground is not derived from the background.

## Checklist

- [ ] No off-token colors (`bg-gray-*`, `text-slate-*`, `bg-[#…]`, and
      `bg-white` / `text-black` — white/black are not tokens) and no arbitrary
      values (`p-[Npx]`). Constant contrast over a data/media background is an
      inline style beside its inline background
- [ ] No `/N` alpha as a surface fill (`bg-primary/10`) — `-subtle` instead;
      `bg-scrim` is the one sanctioned veil
- [ ] Muted text is `base-content-muted`, never `neutral`
- [ ] Every `cursor-pointer` element also changes background (or is a text-only
      interactive changing text color, or a clickable card hovering at the
      frame)
- [ ] Interactive surfaces use `ui-hoverable-{token}`; no utility `bg-*` on the
      same element
- [ ] Explicit `hover:bg-*` pairs only for selectable text or transparent-rest
      affordances
- [ ] Outline `Button` / `ButtonGroup` off `base-100` declares `onBackground`
- [ ] No `-subtle` wash on a clickable's rest surface, hover target, or hover
      destination — except a selected arm's pin
- [ ] Buttons inside `-subtle` callouts are filled at the callout's intent
- [ ] No edge border on a side-frame panel — the frame draws it (`noBorder` only
      for a tonal panel or a deliberate non-default border colour)
- [ ] No `border-base-300` / `border-border`; bare `border` unless marking an
      exception
- [ ] No `rounded-lg` / `shadow-md`; `rounded`, and `shadow-floating` only on
      floating surfaces
- [ ] No named font-weight aliases (`font-normal`, `font-medium`,
      `font-semibold`, `font-bold`) — they are wiped no-ops; use `font-400` /
      `font-700` or an app-declared weight
- [ ] Spacing uses `ui-pad` / `ui-gap` / `ui-spy`, sizing uses `size="sm"`
- [ ] App CSS uses plain `@theme`, no `--color-*: initial`, palettes on `:root`
- [ ] UI text in sentence case
