# Protocol: Styling

**Scope:** UI

See `PROTOCOL_UI_COMPONENTS.md` for component usage.

## Rules

1. **Semantic colors only** — `base-*`, `primary`, `neutral`, `success`,
   `danger`
2. **No arbitrary values** — Never `bg-[#ff0000]` or `p-[23px]`
3. __Use ui-_ utilities_* — `ui-pad`, `ui-gap`, `ui-spy` for spacing
4. **Sentence case** — All UI text in sentence case, not Title Case
5. **No inline styles** — Use Tailwind classes only
6. **Panther components first** — Don't rebuild existing components

## Colors

### Backgrounds

- `base-100` — Cards, primary surfaces
- `base-200` — Page background, secondary panels
- `base-300` — Borders (almost always use this for borders)

### Text

- `base-content` — Primary text (default)
- `neutral` — Secondary/muted text

### Actions & Status

- `primary` — Primary actions, selected states
- `success` — Ready, complete, positive
- `danger` — Errors, destructive actions
- `neutral` — Running, queued, pending

### Borders

```tsx
// ❌ DON'T
<div class="border-gray-300">
<div class="border-primary">  // unless selected/active state

// ✅ DO
<div class="border-base-300">
<div class="border-primary">  // only for selected/active
```

## Spacing

### Padding

- `ui-pad` — Standard container padding
- `ui-pad-sm` — Compact padding
- `ui-pad-lg` — Modal/dialog padding

### Gaps

- `ui-gap` — Standard flex/grid gap
- `ui-gap-sm` — Compact gap

### Vertical Spacing

- `ui-spy` — Vertical spacing between sections
- `ui-spy-sm` — Compact vertical spacing

## Do / Don't

### Colors

```tsx
// ❌ DON'T
<div class="bg-[#f5f5f5] text-[#333]">
<div class="bg-gray-100 text-gray-800">

// ✅ DO
<div class="bg-base-100 text-base-content">
```

### Spacing

```tsx
// ❌ DON'T
<div class="p-4 gap-3">
<div class="p-[23px]">

// ✅ DO
<div class="ui-pad ui-gap">
<div class="ui-pad-sm ui-gap-sm">
```

### Text Case

```tsx
// ❌ DON'T
<Button>Save Changes</Button>
<h1>User Settings</h1>

// ✅ DO
<Button>Save changes</Button>
<h1>User settings</h1>
```

### Status Colors

```tsx
// ❌ DON'T
{
  status === "ready" && <Badge class="bg-green-500">Ready</Badge>;
}

// ✅ DO
{
  status === "ready" && <Badge class="bg-success">Ready</Badge>;
}
{
  status === "error" && <Badge class="bg-danger">Error</Badge>;
}
{
  status === "pending" && <Badge class="bg-neutral">Pending</Badge>;
}
```

## Patterns

### Standard Page Layout

```tsx
<FrameTop panelChildren={<HeadingBar heading="Title" />}>
  <div class="ui-pad ui-spy">
    {/* Content */}
  </div>
</FrameTop>;
```

### Card with Border

```tsx
<div class="ui-pad border border-base-300 rounded">
  {/* Content */}
</div>;
```

### Success/Active State

```tsx
<div class="border border-success bg-success/10 rounded">
```

### Grid Layout

```tsx
<div class="ui-gap grid grid-cols-12">
  <div class="col-span-4">{/* ... */}</div>
  <div class="col-span-8">{/* ... */}</div>
</div>;
```

## Checklist

- [ ] No arbitrary Tailwind values (`[#xxx]`, `[Npx]`)
- [ ] Colors use semantic names only
- [ ] Spacing uses `ui-*` utilities
- [ ] UI text in sentence case
- [ ] No inline styles
- [ ] Borders use `border-base-300` (or `border-primary` for active state)
