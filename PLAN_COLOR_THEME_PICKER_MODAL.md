# PLAN: ColorThemePicker Modal with Live Previews

Replaces the unfinished Phase 7 of the (now-deleted) `PLAN_SIMPLIFIED_COLOR_PRESETS.md`.
Phases 1–6 of that plan all shipped; the modal preview is the only remaining piece.

## Status

- [ ] Open questions answered (see below)
- [ ] Modal component
- [ ] Preview grid wiring
- [ ] Inline picker updated to open modal
- [ ] Manual QA across presets + custom color

---

## Open Questions (answer before starting)

1. **Which slide does each preset card preview?**
   - Options: (a) fixed cover slide, (b) fixed content slide, (c) cycle cover→section→content,
     (d) two-up cover + content per card.
   - Answer:

2. **Inline picker fate** — does the modal *replace* the inline swatches, or sit *behind*
   a "More themes…" button while the inline picker stays as quick access?
   - Answer:

3. **Custom color in modal** — render the hex input inline inside the "Custom" card,
   or open a sub-popover from that card?
   - Answer:

---

## Goal

Let users compare color themes visually before committing, instead of clicking a swatch and
watching the main canvas reflow.

## Scope

Single phase. Reuses existing infrastructure:

- `PresetCard.tsx` — generic card with aspect-video preview slot, already used by
  `LayoutPicker` and `TreatmentPicker`.
- `StylePreview.tsx` — already renders a `PageHolder`-driven preview from a
  `SlideDeckConfig`. Mini variant can override the canvas width.
- `ColorThemePicker.tsx` (current inline picker) — adapted as the modal trigger.

## Implementation Steps

### 1. Modal component

**New file**: `client/src/components/slide_deck/style_editor/ColorThemePickerModal.tsx`

- Props: `value: ColorTheme`, `config: SlideDeckConfig`, `onChange`, `onClose`.
- Grid of `PresetCard`, one per: standard presets (`getColorPresets()`), `BRAND_PRESETS`,
  plus a "Custom" card.
- Each card's preview slot renders `StylePreview` (or scaled wrapper) with `config` cloned
  and `colorTheme` overridden to that card's theme.
- Click card → `onChange` + `onClose`. ESC / backdrop → `onClose` (no commit).

### 2. Inline picker

**Edit**: `client/src/components/slide_deck/style_editor/ColorThemePicker.tsx`

- Keep the current swatch row as the closed state.
- Add a trigger (per Q2 above): either replace swatches with a single "Choose theme…" button
  showing the current swatch, or add a "More themes…" affordance.
- Modal mount stays inside this component so the public API to `slide_deck_settings.tsx`
  doesn't change.

### 3. Custom color flow

- Per Q3, either: inline hex input inside the Custom card (matches current inline UX), or a
  sub-popover. Validation reuses `validateBrandColor` from panther.

## Files Affected

| File | Change |
|------|--------|
| `client/src/components/slide_deck/style_editor/ColorThemePickerModal.tsx` | NEW |
| `client/src/components/slide_deck/style_editor/ColorThemePicker.tsx` | Add modal trigger |
| `client/src/components/slide_deck/slide_deck_settings.tsx` | No change (picker API unchanged) |

## Success Criteria

- Each preset visible as a live mini slide preview before selection.
- Custom color flow still works and validation feedback still shown.
- Inline picker still functional as quick-pick affordance (if Q2 keeps it).
- No regressions to existing color theme persistence / migration.
