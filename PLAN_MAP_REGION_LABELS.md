# Plan: Add "Show region label" option for maps

## Summary

Add a new optional boolean `mapShowRegionLabels` to `PresentationObjectConfig.s`. When enabled, map data labels show the region name. When both region labels and data labels are enabled, show `{region}\n{data}`.

## Changes

### 1. Type definition

**File:** `lib/types/presentation_objects.ts:404` (after `mapDomainMax`)

Add:
```ts
mapShowRegionLabels?: boolean;
```

Optional for backwards compatibility.

### 2. Editor UI checkbox

**File:** `client/src/components/visualization/presentation_object_editor_panel_style/_map.tsx:168`

Add a checkbox before the existing "Show data labels" checkbox:

```tsx
<Checkbox
  checked={p.tempConfig.s.mapShowRegionLabels ?? false}
  onChange={(v) => p.setTempConfig("s", "mapShowRegionLabels", v)}
  label={t3({
    en: "Show region labels",
    fr: "Afficher les noms de region",
  })}
/>
```

### 3. Update textFormatter in map regions content

**File:** `client/src/generate_visualization/get_style_from_po/_0_common.ts` — `getMapRegionsContent` function (line 86)

Currently the `dataLabel.show` is tied only to `config.s.showDataLabels`. It needs to also show when `mapShowRegionLabels` is true.

Change:
```ts
dataLabel: {
  show: config.s.showDataLabels,
  ...
}
```
To:
```ts
dataLabel: {
  show: config.s.showDataLabels || (config.s.mapShowRegionLabels ?? false),
  ...
}
```

Change the `textFormatter`:
```ts
textFormatter: (info: MapRegionInfo) => {
  const showRegion = config.s.mapShowRegionLabels ?? false;
  const showData = config.s.showDataLabels;
  const regionText = showRegion ? info.featureId : "";
  const dataText = showData && info.value !== undefined
    ? getFormatterFunc(formatAs, config.s.decimalPlaces ?? 0)(info.value)
    : "";
  if (regionText && dataText) return `${regionText}\n${dataText}`;
  if (regionText) return regionText;
  if (dataText) return dataText;
  return "";
},
```

**Key insight:** `info.featureId` is the admin area name (the processed GeoJSON sets `area_id` as the only property, and `areaMatchProp` is `"area_id"`). So `featureId` gives us the region name directly.

## Notes

- No migration needed (optional field, client-side only config)
- No panther changes needed (textFormatter already supports arbitrary strings including newlines via `mText`)
- The `dataLabel.show` must be true whenever either option is checked, otherwise no labels render at all
