import {
  DisaggregationDisplayOption,
  DisaggregationOption,
  PresentationObjectConfig,
  PresentationObjectDetail,
  PresentationOption,
  ResultsValue,
  VIZ_TYPE_CONFIG,
  convertVisualizationType,
  get_PRESENTATION_SELECT_OPTIONS,
  t3,
} from "lib";
import { Select } from "panther";
import { SetStoreFunction } from "solid-js/store";

type DataValuesSummaryProps = {
  poDetail: PresentationObjectDetail;
};

export function DataValuesSummary(p: DataValuesSummaryProps) {
  return (
    <div class="">
      <div class="text-md font-700 pb-1">
        {t3({ en: "Metric", fr: "Indicateur" })}
      </div>
      <div class="text-sm">{p.poDetail.resultsValue.label}</div>
    </div>
  );
}

type TypeSpecificCache = {
  valuesDisDisplayOpt: DisaggregationDisplayOption;
  disaggregateBy: { disOpt: DisaggregationOption; disDisplayOpt: DisaggregationDisplayOption }[];
  content: PresentationObjectConfig["s"]["content"];
  styleOverrides: Partial<PresentationObjectConfig["s"]>;
};

function extractStyleOverrides(config: PresentationObjectConfig): Partial<PresentationObjectConfig["s"]> {
  const allResetKeys = new Set<string>();
  for (const tc of Object.values(VIZ_TYPE_CONFIG)) {
    for (const key of Object.keys(tc.styleResets)) {
      allResetKeys.add(key);
    }
  }
  const overrides: Record<string, unknown> = {};
  for (const key of allResetKeys) {
    overrides[key] = config.s[key as keyof PresentationObjectConfig["s"]];
  }
  return overrides as Partial<PresentationObjectConfig["s"]>;
}

type PresentationTypeSummaryProps = {
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  disaggregationOptions: ResultsValue["disaggregationOptions"];
};

export function PresentationTypeSummary(p: PresentationTypeSummaryProps) {
  const cache = new Map<PresentationOption, TypeSpecificCache>();

  const allowedTypes = () => {
    const activeDisOpts = p.tempConfig.d.disaggregateBy.map((d) => d.disOpt);
    const restrictions = p.disaggregationOptions
      .filter((d) => activeDisOpts.includes(d.value) && d.allowedPresentationOptions)
      .map((d) => d.allowedPresentationOptions!);
    return get_PRESENTATION_SELECT_OPTIONS().filter((opt) =>
      restrictions.every((allowed) => allowed.includes(opt.value))
    );
  };

  return (
    <div class="">
      <div class="text-md font-700 pb-1">
        {t3({ en: "Presentation type", fr: "Type de présentation" })}
      </div>
      <Select
        options={allowedTypes()}
        value={p.tempConfig.d.type}
        onChange={(v) => {
          const newType = v as PresentationOption;
          const currentType = p.tempConfig.d.type;
          if (newType === currentType) return;

          cache.set(currentType, {
            valuesDisDisplayOpt: p.tempConfig.d.valuesDisDisplayOpt,
            disaggregateBy: p.tempConfig.d.disaggregateBy.map((d) => ({ ...d })),
            content: p.tempConfig.s.content,
            styleOverrides: extractStyleOverrides(p.tempConfig),
          });

          const cached = cache.get(newType);
          if (cached) {
            p.setTempConfig("d", "type", newType);
            p.setTempConfig("d", "valuesDisDisplayOpt", cached.valuesDisDisplayOpt);
            p.setTempConfig("d", "disaggregateBy", cached.disaggregateBy);
            p.setTempConfig("s", "content", cached.content);
            p.setTempConfig("s", (prev) => ({ ...prev, ...cached.styleOverrides }));
          } else {
            const converted = convertVisualizationType(
              p.tempConfig,
              newType,
              p.disaggregationOptions,
            );
            p.setTempConfig("d", "type", converted.d.type);
            p.setTempConfig("d", "valuesDisDisplayOpt", converted.d.valuesDisDisplayOpt);
            p.setTempConfig("d", "disaggregateBy", converted.d.disaggregateBy);
            p.setTempConfig("s", "content", converted.s.content);
            p.setTempConfig("s", (prev) => ({ ...prev, ...VIZ_TYPE_CONFIG[newType].styleResets }));
          }
        }}
        fullWidth
      />
    </div>
  );
}
