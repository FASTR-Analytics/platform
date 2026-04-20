import { adaptLegacyVizPresets } from "./po_config.ts";

// Adapts the full stored module_definition blob (modules.module_definition)
// before it reaches moduleDefinitionStoredSchema.parse. Walks the nested
// metrics[].vizPresets[] arrays and delegates to adaptLegacyVizPresets, which
// handles the periodOpt → timeseriesGrouping rename, the
// conditionalFormatting string → object migration, the map-color-fields →
// ConditionalFormatting migration, and the drop of legacy
// defaultPeriodFilterForDefaultVisualizations entries.
export function adaptLegacyModuleDefinition(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(obj.metrics)) {
    obj.metrics = obj.metrics.map((m) => {
      if (!m || typeof m !== "object" || Array.isArray(m)) return m;
      const metric = { ...(m as Record<string, unknown>) };
      if (Array.isArray(metric.vizPresets)) {
        metric.vizPresets = adaptLegacyVizPresets(metric.vizPresets);
      }
      return metric;
    });
  }
  return obj;
}
