import { PresentationObjectConfig, t3 } from "lib";
import { Checkbox, ColorPicker, RadioGroup, Slider } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";

type Props = {
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export function MapStyleControls(p: Props) {
  return (
    <>
      <RadioGroup
        label={t3({ en: "Map projection", fr: "Projection cartographique" })}
        options={[
          {
            value: "equirectangular",
            label: t3({ en: "Equirectangular", fr: "Équirectangulaire" }),
          },
          {
            value: "mercator",
            label: t3({ en: "Mercator", fr: "Mercator" }),
          },
          {
            value: "naturalEarth1",
            label: t3({ en: "Natural Earth", fr: "Natural Earth" }),
          },
        ]}
        value={p.tempConfig.s.mapProjection}
        onChange={(v) =>
          p.setTempConfig(
            "s",
            "mapProjection",
            v as "equirectangular" | "mercator" | "naturalEarth1",
          )
        }
      />
      <div class="ui-spy-sm">
        <RadioGroup
          label={t3({ en: "Color preset", fr: "Préréglage de couleurs" })}
          options={[
            {
              value: "red-green",
              label: t3({ en: "Red → Green", fr: "Rouge → Vert" }),
            },
            { value: "red", label: t3({ en: "Red", fr: "Rouge" }) },
            { value: "blue", label: t3({ en: "Blue", fr: "Bleu" }) },
            { value: "green", label: t3({ en: "Green", fr: "Vert" }) },
            {
              value: "custom",
              label: t3({ en: "Custom", fr: "Personnalisé" }),
            },
          ]}
          value={p.tempConfig.s.mapColorPreset}
          onChange={(v) =>
            p.setTempConfig(
              "s",
              "mapColorPreset",
              v as "red" | "blue" | "green" | "red-green" | "custom",
            )
          }
        />
        <Show when={p.tempConfig.s.mapColorPreset === "custom"}>
          <ColorPicker
            label={t3({ en: "From color", fr: "Couleur de départ" })}
            value={p.tempConfig.s.mapColorFrom}
            onChange={(v) => p.setTempConfig("s", "mapColorFrom", v)}
            colorSet="standard"
            fullWidth
          />
          <ColorPicker
            label={t3({ en: "To color", fr: "Couleur d'arrivée" })}
            value={p.tempConfig.s.mapColorTo}
            onChange={(v) => p.setTempConfig("s", "mapColorTo", v)}
            colorSet="standard"
            fullWidth
          />
        </Show>
      </div>
      <Checkbox
        label={t3({ en: "Reverse scale", fr: "Inverser l'échelle" })}
        checked={p.tempConfig.s.mapColorReverse}
        onChange={(v) => p.setTempConfig("s", "mapColorReverse", v)}
      />
      <RadioGroup
        label={t3({ en: "Scale type", fr: "Type d'échelle" })}
        options={[
          {
            value: "continuous",
            label: t3({ en: "Continuous", fr: "Continue" }),
          },
          {
            value: "discrete",
            label: t3({ en: "Discrete", fr: "Discrète" }),
          },
        ]}
        value={p.tempConfig.s.mapScaleType}
        onChange={(v) =>
          p.setTempConfig("s", "mapScaleType", v as "continuous" | "discrete")
        }
        horizontal
      />
      <Show when={p.tempConfig.s.mapScaleType === "discrete"}>
        <Slider
          label={t3({ en: "Number of steps", fr: "Nombre de paliers" })}
          min={3}
          max={10}
          step={1}
          value={p.tempConfig.s.mapDiscreteSteps}
          onChange={(v) => p.setTempConfig("s", "mapDiscreteSteps", v)}
          fullWidth
          showValueInLabel
          ticks={{
            major: 8,
            showLabels: true,
          }}
        />
      </Show>
      <div class="ui-spy-sm">
        <Checkbox
          label={t3({
            en: "Fix value range",
            fr: "Fixer la plage de valeurs",
          })}
          checked={p.tempConfig.s.mapDomainType === "fixed"}
          onChange={(v) =>
            p.setTempConfig("s", "mapDomainType", v ? "fixed" : "auto")
          }
        />
        <Show when={p.tempConfig.s.mapDomainType === "fixed"}>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 text-sm">
              {t3({ en: "Min", fr: "Min" })}
              <input
                type="number"
                step="0.01"
                value={p.tempConfig.s.mapDomainMin}
                onInput={(e) =>
                  p.setTempConfig(
                    "s",
                    "mapDomainMin",
                    Number(e.currentTarget.value),
                  )
                }
                class="border-base-300 w-24 rounded border px-2 py-1 text-sm"
              />
            </label>
            <label class="flex items-center gap-1.5 text-sm">
              {t3({ en: "Max", fr: "Max" })}
              <input
                type="number"
                step="0.01"
                value={p.tempConfig.s.mapDomainMax}
                onInput={(e) =>
                  p.setTempConfig(
                    "s",
                    "mapDomainMax",
                    Number(e.currentTarget.value),
                  )
                }
                class="border-base-300 w-24 rounded border px-2 py-1 text-sm"
              />
            </label>
          </div>
        </Show>
      </div>
      <Checkbox
        checked={p.tempConfig.s.showDataLabels}
        onChange={(v) => p.setTempConfig("s", "showDataLabels", v)}
        label={t3({
          en: "Show data labels",
          fr: "Afficher les étiquettes de données",
        })}
      />
    </>
  );
}
