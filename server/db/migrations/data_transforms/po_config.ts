// =============================================================================
// DATA TRANSFORM: presentation_objects.config
// =============================================================================
//
// Table:    presentation_objects
// Column:   config (JSON)
// Schema:   lib/types/_presentation_object_config.ts
//           → presentationObjectConfigSchema
//
// HOW THIS WORKS:
// - Runs at startup in a transaction
// - For each row: validate against current schema
// - If valid: skip (no work needed)
// - If invalid: apply transform blocks, validate, write
// - If any row fails validation after transforms: rollback, boot fails
//
// TRANSFORM BLOCKS:
// 1. periodOpt → timeseriesGrouping
// 2. periodFilter.filterType "last_12_months" → "last_n_months"
// 3. periodFilter.filterType undefined → "custom"
// 4. Strip periodOption/min/max from relative filter types
// 5. Legacy conditionalFormatting string preset → capture as legacyCf
// 6. Legacy mapColor* fields → capture as legacyCf (maps only)
// 7. Strip legacy mapColor* fields
// 8. Fill flat cf* fields from captured legacyCf or defaults
// 9. diffAreas → specialDisruptionsChart (keep fields, set neutral values)
// 10. Fill mapProjection default
//
// =============================================================================

import {
  presentationObjectConfigSchema,
  flattenCf,
  CF_STORAGE_DEFAULTS,
  LEGACY_CF_PRESETS,
  type ConditionalFormatting,
  type ConditionalFormattingScale,
} from "lib";
import type { Sql } from "postgres";
import { _PO_DETAIL_CACHE } from "../../../routes/caches/visualizations.ts";

const RELATIVE_FILTER_TYPES = new Set([
  "last_n_months",
  "last_calendar_year",
  "last_calendar_quarter",
  "last_n_calendar_years",
  "last_n_calendar_quarters",
]);

const MAP_COLOR_PRESET_STOPS: Record<string, [string, string]> = {
  "red-green": ["#de2d26", "#31a354"],
  red: ["#fee0d2", "#de2d26"],
  blue: ["#deebf7", "#3182bd"],
  green: ["#e5f5e0", "#31a354"],
};

const MAP_NO_DATA_COLOR = "#f0f0f0";

function buildCfFromLegacyMapFields(
  s: Record<string, unknown>,
): ConditionalFormattingScale | undefined {
  const preset = (s.mapColorPreset as string | undefined) ?? "red-green";
  const reverse = Boolean(s.mapColorReverse);
  const [rawFrom, rawTo] =
    preset === "custom"
      ? [
          (s.mapColorFrom as string | undefined) ?? "#fee0d2",
          (s.mapColorTo as string | undefined) ?? "#de2d26",
        ]
      : MAP_COLOR_PRESET_STOPS[preset] ?? MAP_COLOR_PRESET_STOPS["red-green"];
  const [from, to] = reverse ? [rawTo, rawFrom] : [rawFrom, rawTo];

  const scaleType = (s.mapScaleType as string | undefined) ?? "continuous";
  const steps =
    scaleType === "discrete"
      ? (s.mapDiscreteSteps as number | undefined) ?? 5
      : undefined;

  const domainType = (s.mapDomainType as string | undefined) ?? "auto";
  const domain: ConditionalFormattingScale["domain"] =
    domainType === "fixed"
      ? {
          kind: "fixed",
          min: (s.mapDomainMin as number | undefined) ?? 0,
          max: (s.mapDomainMax as number | undefined) ?? 1,
        }
      : { kind: "auto" };

  return {
    type: "scale",
    scale: { min: from, max: to },
    steps,
    domain,
    noDataColor: MAP_NO_DATA_COLOR,
  };
}

export type MigrationStats = {
  rowsChecked: number;
  rowsTransformed: number;
};

export async function migratePOConfigs(tx: Sql, projectId: string): Promise<MigrationStats> {
  const rows = await tx<{ id: string; config: string }[]>`
    SELECT id, config FROM presentation_objects
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const config = JSON.parse(row.config);

    // Already valid? Skip.
    if (presentationObjectConfigSchema.safeParse(config).success) {
      continue;
    }

    // Deep clone to avoid mutating original
    const c = structuredClone(config) as Record<string, unknown>;
    const d = (c.d ?? {}) as Record<string, unknown>;
    const s = (c.s ?? {}) as Record<string, unknown>;

    // ─── configD transforms ───────────────────────────────────────────────

    // Block 1: periodOpt → timeseriesGrouping
    if (d.periodOpt !== undefined) {
      d.timeseriesGrouping ??= d.periodOpt;
      delete d.periodOpt;
    }

    // Block 2: periodFilter.filterType "last_12_months" → "last_n_months"
    const pf = d.periodFilter as Record<string, unknown> | undefined;
    if (pf?.filterType === "last_12_months") {
      pf.filterType = "last_n_months";
      pf.nMonths = 12;
      delete pf.periodOption;
      delete pf.min;
      delete pf.max;
    }

    // Block 3: periodFilter.filterType undefined → "custom"
    if (pf && pf.filterType === undefined) {
      pf.filterType = "custom";
    }

    // Block 4: Strip periodOption/min/max from relative filter types
    if (pf && RELATIVE_FILTER_TYPES.has(pf.filterType as string)) {
      delete pf.periodOption;
      delete pf.min;
      delete pf.max;
    }

    // ─── configS transforms ───────────────────────────────────────────────

    const isMap = d.type === "map";
    let legacyCf: ConditionalFormatting | undefined;

    // Block 5: Legacy conditionalFormatting string preset → capture as legacyCf
    if (s.conditionalFormatting !== undefined) {
      const cfRaw = s.conditionalFormatting;
      if (typeof cfRaw === "string" && cfRaw in LEGACY_CF_PRESETS) {
        legacyCf = LEGACY_CF_PRESETS[cfRaw as keyof typeof LEGACY_CF_PRESETS].value;
      }
      delete s.conditionalFormatting;
    }

    // Block 6: Legacy mapColor* fields → capture as legacyCf (maps only)
    if (isMap && (!legacyCf || legacyCf.type === "none")) {
      if (
        s.mapColorPreset !== undefined ||
        s.mapColorFrom !== undefined ||
        s.mapColorTo !== undefined ||
        s.mapColorReverse !== undefined ||
        s.mapScaleType !== undefined ||
        s.mapDiscreteSteps !== undefined ||
        s.mapDomainType !== undefined ||
        s.mapDomainMin !== undefined ||
        s.mapDomainMax !== undefined
      ) {
        const scaleCf = buildCfFromLegacyMapFields(s);
        if (scaleCf) legacyCf = scaleCf;
      }
    }

    // Block 7: Strip legacy mapColor* fields (no home in current schema)
    delete s.mapColorPreset;
    delete s.mapColorFrom;
    delete s.mapColorTo;
    delete s.mapColorReverse;
    delete s.mapScaleType;
    delete s.mapDiscreteSteps;
    delete s.mapDomainType;
    delete s.mapDomainMin;
    delete s.mapDomainMax;

    // Block 8: Fill flat cf* fields from captured legacyCf or defaults
    const flatSource = legacyCf ? flattenCf(legacyCf) : CF_STORAGE_DEFAULTS;
    for (const [key, value] of Object.entries(flatSource)) {
      if (!(key in s)) s[key] = value;
    }

    // Block 9: diffAreas → specialDisruptionsChart
    // NOTE: Don't delete diffAreas/diffAreasOrder — schema still requires them.
    // Set to neutral values. Phase 6 removes them from schema + data.
    if (s.diffAreas === true) {
      s.specialDisruptionsChart = true;
    }
    s.diffAreas = false;
    s.diffAreasOrder = "actual-expected";

    // Block 10: Fill mapProjection default (required field added later)
    if (!("mapProjection" in s)) s.mapProjection = "equirectangular";

    c.d = d;
    c.s = s;

    // Validate against current schema — throws if invalid
    const validated = presentationObjectConfigSchema.parse(c);

    // Write + update last_updated (invalidates cache)
    await tx`
      UPDATE presentation_objects
      SET config = ${JSON.stringify(validated)}, last_updated = ${now}
      WHERE id = ${row.id}
    `;

    // Clear Valkey cache for this specific PO
    _PO_DETAIL_CACHE.clear({ projectId, presentationObjectId: row.id });

    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
