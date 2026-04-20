import { PresentationObjectConfig, PresentationObjectDetail, selectCf, t3 } from "lib";
import {
  Checkbox,
  LabelHolder,
  RadioGroup,
  Slider,
  getSelectOptions,
  toNum0,
} from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";

type SharedTopProps = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  usingCells: () => boolean;
};

export function SharedControlsTop(p: SharedTopProps) {
  return (
    <>
      <Slider
        label={t3({ en: "Scale", fr: "Échelle" })}
        min={0.1}
        max={5}
        step={0.1}
        value={p.tempConfig.s.scale}
        onChange={(v) => p.setTempConfig("s", "scale", v)}
        fullWidth
        showValueInLabel
        ticks={{
          major: [0.1, 1, 2, 3, 4, 5],
          showLabels: true,
          labelFormatter: toNum0,
        }}
      />
      <Show when={p.usingCells()}>
        <LabelHolder
          label={t3({
            en: "Number of grid columns",
            fr: "Nombre de colonnes de grille",
          })}
        >
          <div class="ui-spy-sm">
            <Checkbox
              label={t3({ en: "Auto", fr: "Auto" })}
              checked={p.tempConfig.s.nColsInCellDisplay === "auto"}
              onChange={(v) => {
                if (v) {
                  p.setTempConfig("s", "nColsInCellDisplay", "auto");
                } else {
                  p.setTempConfig("s", "nColsInCellDisplay", 2);
                }
              }}
            />
            <Show when={p.tempConfig.s.nColsInCellDisplay !== "auto"}>
              <Slider
                label={t3({ en: "Columns", fr: "Colonnes" })}
                min={1}
                max={10}
                step={1}
                value={p.tempConfig.s.nColsInCellDisplay as number}
                onChange={(v) => p.setTempConfig("s", "nColsInCellDisplay", v)}
                fullWidth
                showValueInLabel
              />
            </Show>
          </div>
        </LabelHolder>
      </Show>
    </>
  );
}

type SharedBottomProps = {
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export function SharedControlsBottom(p: SharedBottomProps) {
  return (
    <>
      <Show
        when={
          !p.tempConfig.s.specialCoverageChart &&
          (p.tempConfig.d.type !== "table" ||
            !p.tempConfig.s.specialScorecardTable)
        }
      >
        <RadioGroup
          label={t3({ en: "Decimal places", fr: "Décimales" })}
          options={getSelectOptions(["0", "1", "2", "3"])}
          value={String(p.tempConfig.s.decimalPlaces)}
          onChange={(v) =>
            p.setTempConfig("s", "decimalPlaces", Number(v) as 1 | 2 | 3)
          }
          horizontal
        />
      </Show>
      <Show
        when={
          !p.tempConfig.s.specialCoverageChart &&
          !p.tempConfig.s.specialBarChart &&
          !p.tempConfig.s.specialDisruptionsChart &&
          (p.tempConfig.d.type !== "table" ||
            selectCf(p.tempConfig.s).type !== "none")
        }
      >
        <Checkbox
          checked={p.tempConfig.s.hideLegend}
          onChange={(v) => p.setTempConfig("s", "hideLegend", v)}
          label={t3({ en: "Hide legend", fr: "Masquer la légende" })}
        />
      </Show>
    </>
  );
}
