import {
  type ConditionalFormatting,
  type ConditionalFormattingScale,
  type ConditionalFormattingThresholds,
  LEGACY_CF_PRESET_IDS,
  LEGACY_CF_PRESETS,
  type LegacyCfPresetId,
  deriveBucketLabels,
  type IndicatorFormat,
  t3,
} from "lib";
import {
  Button,
  ButtonGroup,
  Checkbox,
  ColorPicker,
  type ColorKeyOrString,
  type ContinuousScaleConfig,
  NumberInput,
  PercentSelect,
  RadioGroup,
  Select,
  type SelectOption,
  Slider,
} from "panther";
import { For, Show } from "solid-js";
import { buildAutoValueFormatter } from "~/generate_visualization/conditional_formatting/compile";
import { StyleRevealGroup } from "./presentation_object_editor_panel_style/_style_components";

type Props = {
  value: ConditionalFormatting | undefined;
  onChange: (v: ConditionalFormatting) => void;
  formatAs: IndicatorFormat;
  decimalPlaces: number;
  allowNegative?: boolean;
};

type Mode = "none" | "scale" | "thresholds";

const NO_DATA_DEFAULT_THRESHOLDS = "#ffffff";
const NO_DATA_DEFAULT_SCALE = "#f0f0f0";

export function ConditionalFormattingEditor(p: Props) {
  const cf = (): ConditionalFormatting => p.value ?? { type: "none" };

  const handleModeChange = (mode: Mode | undefined) => {
    if (!mode || mode === "none") {
      p.onChange({ type: "none" });
      return;
    }
    if (mode === "scale") {
      p.onChange(cf().type === "scale" ? cf() : defaultScaleCf());
      return;
    }
    p.onChange(cf().type === "thresholds" ? cf() : defaultThresholdsCf());
  };

  return (
    <div class="ui-spy-sm">
      <ButtonGroup<Mode>
        items={[
          { id: "none", label: t3({ en: "Off", fr: "Désactivé", pt: "Desativado" }) },
          { id: "scale", label: t3({ en: "Scale", fr: "Échelle", pt: "Escala" }) },
          {
            id: "thresholds",
            label: t3({ en: "Thresholds", fr: "Seuils", pt: "Limiares" }),
          },
        ]}
        value={cf().type}
        onChange={handleModeChange}
        size="sm"
      />
      <Show when={cf().type === "scale"}>
        <ScalePanel
          cf={cf() as ConditionalFormattingScale}
          onChange={p.onChange}
          formatAs={p.formatAs}
          allowNegative={p.allowNegative}
        />
      </Show>
      <Show when={cf().type === "thresholds"}>
        <ThresholdsPanel
          cf={cf() as ConditionalFormattingThresholds}
          onChange={p.onChange}
          formatAs={p.formatAs}
          decimalPlaces={p.decimalPlaces}
          allowNegative={p.allowNegative}
        />
      </Show>
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Scale panel
////////////////////////////////////////////////////////////////////////////////

const PALETTE_OPTIONS: { value: string; label: string }[] = [
  { value: "rd-yl-gn", label: "Red → Yellow → Green" },
  { value: "rd-gn-muted", label: "Red → Green (muted)" },
  { value: "rd-bu", label: "Red → Blue" },
  { value: "spectral", label: "Spectral" },
  { value: "blues", label: "Blues" },
  { value: "greens", label: "Greens" },
  { value: "reds", label: "Reds" },
  { value: "oranges", label: "Oranges" },
  { value: "purples", label: "Purples" },
  { value: "viridis", label: "Viridis" },
  { value: "plasma", label: "Plasma" },
  { value: "inferno", label: "Inferno" },
  { value: "turbo", label: "Turbo" },
];

const CUSTOM_PALETTE = "__custom__";

function ScalePanel(p: {
  cf: ConditionalFormattingScale;
  onChange: (v: ConditionalFormatting) => void;
  formatAs: IndicatorFormat;
  allowNegative?: boolean;
}) {
  const state = () => parseScale(p.cf.scale);

  const update = (patch: Partial<ConditionalFormattingScale>) => {
    p.onChange({ ...p.cf, ...patch });
  };

  const updateScale = (patch: Partial<ScaleEditorState>) => {
    const next = { ...state(), ...patch };
    update({ scale: serializeScale(next) });
  };

  const isDiscrete = () => (p.cf.steps ?? 0) >= 2;
  const isFixed = () => p.cf.domain.kind === "fixed";
  const hasMid = () => state().mid !== undefined;

  return (
    <StyleRevealGroup>
      <Select
        label={t3({ en: "Palette", fr: "Palette", pt: "Paleta" })}
        value={
          state().mode === "custom"
            ? CUSTOM_PALETTE
            : (state().paletteName ?? "rd-yl-gn")
        }
        options={[
          ...PALETTE_OPTIONS,
          {
            value: CUSTOM_PALETTE,
            label: t3({ en: "Custom", fr: "Personnalisé", pt: "Personalizado" }),
          },
        ]}
        onChange={(v) => {
          if (v === CUSTOM_PALETTE) {
            updateScale({
              mode: "custom",
              from: "#fee0d2",
              to: "#de2d26",
              mid: undefined,
            });
          } else {
            updateScale({ mode: "preset", paletteName: v });
          }
        }}
        fullWidth
      />
      <Show when={state().mode === "custom"}>
        <div class="flex flex-wrap items-end gap-3">
          <ColorPicker
            label={t3({ en: "From", fr: "Départ", pt: "De" })}
            value={colorToString(state().from ?? "#fee0d2")}
            onChange={(v) => updateScale({ from: v })}
            colorSet="standard"
          />
          <Show when={hasMid()}>
            <ColorPicker
              label={t3({ en: "Mid", fr: "Milieu", pt: "Meio" })}
              value={colorToString(state().mid ?? "#ffffff")}
              onChange={(v) => updateScale({ mid: v })}
              colorSet="standard"
            />
          </Show>
          <ColorPicker
            label={t3({ en: "To", fr: "Arrivée", pt: "Para" })}
            value={colorToString(state().to ?? "#de2d26")}
            onChange={(v) => updateScale({ to: v })}
            colorSet="standard"
          />
          <Checkbox
            label={t3({ en: "Diverging (mid)", fr: "Divergent (milieu)", pt: "Divergente (meio)" })}
            checked={hasMid()}
            onChange={(v) => updateScale({ mid: v ? "#ffffff" : undefined })}
          />
        </div>
      </Show>
      <Checkbox
        label={t3({ en: "Reverse", fr: "Inverser", pt: "Inverter" })}
        checked={state().reverse}
        onChange={(v) => updateScale({ reverse: v })}
      />
      <RadioGroup<"continuous" | "discrete">
        label={t3({ en: "Scale type", fr: "Type d'échelle", pt: "Tipo de escala" })}
        options={[
          {
            value: "continuous",
            label: t3({ en: "Continuous", fr: "Continue", pt: "Contínua" }),
          },
          { value: "discrete", label: t3({ en: "Discrete", fr: "Discrète", pt: "Discreta" }) },
        ]}
        value={isDiscrete() ? "discrete" : "continuous"}
        onChange={(v) =>
          update({ steps: v === "discrete" ? (p.cf.steps ?? 5) : undefined })
        }
        horizontal
      />
      <Show when={isDiscrete()}>
        <Slider
          label={t3({ en: "Number of steps", fr: "Nombre de paliers", pt: "Número de passos" })}
          min={2}
          max={10}
          step={1}
          value={p.cf.steps ?? 5}
          onChange={(v) => update({ steps: v })}
          fullWidth
          showValueInLabel
        />
      </Show>
      <div class="ui-spy-sm">
        <Checkbox
          label={t3({ en: "Fix value range", fr: "Fixer la plage de valeurs", pt: "Fixar intervalo de valores" })}
          checked={isFixed()}
          onChange={(v) =>
            update({
              domain: v ? { kind: "fixed", min: 0, max: 1 } : { kind: "auto" },
            })
          }
        />
        <Show when={isFixed() && p.cf.domain.kind === "fixed"}>
          {(() => {
            const domain = p.cf.domain as {
              kind: "fixed";
              min: number;
              max: number;
              mid?: number;
            };
            return (
              <div class="flex items-center gap-3">
                <ValueInput
                  label={t3({ en: "Min", fr: "Min", pt: "Mín" })}
                  value={domain.min}
                  onChange={(v) => update({ domain: { ...domain, min: v } })}
                  formatAs={p.formatAs}
                  max={domain.max}
                  allowNegative={p.allowNegative}
                />
                <ValueInput
                  label={t3({ en: "Max", fr: "Max", pt: "Máx" })}
                  value={domain.max}
                  onChange={(v) => update({ domain: { ...domain, max: v } })}
                  formatAs={p.formatAs}
                  min={domain.min}
                  allowNegative={p.allowNegative}
                />
              </div>
            );
          })()}
        </Show>
      </div>
    </StyleRevealGroup>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Thresholds panel
////////////////////////////////////////////////////////////////////////////////

const CUSTOM_PRESET_VALUE = "__custom__";

function ThresholdsPanel(p: {
  cf: ConditionalFormattingThresholds;
  onChange: (v: ConditionalFormatting) => void;
  formatAs: IndicatorFormat;
  decimalPlaces: number;
  allowNegative?: boolean;
}) {
  const matchedPreset = (): LegacyCfPresetId | undefined => {
    for (const id of LEGACY_CF_PRESET_IDS) {
      if (thresholdsEqual(p.cf, LEGACY_CF_PRESETS[id].value)) return id;
    }
    return undefined;
  };

  const presetOptions = (): SelectOption<string>[] => {
    const matched = matchedPreset();
    const items: SelectOption<string>[] = LEGACY_CF_PRESET_IDS.map((id) => ({
      value: id,
      label: t3(LEGACY_CF_PRESETS[id].label),
    }));
    if (!matched) {
      items.push({
        value: CUSTOM_PRESET_VALUE,
        label: t3({ en: "Custom", fr: "Personnalisé", pt: "Personalizado" }),
      });
    }
    return items;
  };

  const applyPreset = (id: string) => {
    if (id === CUSTOM_PRESET_VALUE) return;
    const preset = LEGACY_CF_PRESETS[id as LegacyCfPresetId];
    if (preset) p.onChange(preset.value);
  };

  const update = (patch: Partial<ConditionalFormattingThresholds>) => {
    p.onChange({ ...p.cf, ...patch });
  };

  const setCutoff = (i: number, v: number) => {
    const cutoffs = [...p.cf.cutoffs];
    // Enforce increasing order: clamp the new value between neighbors.
    // cutoffs[i] must stay ≥ cutoffs[i-1] and ≤ cutoffs[i+1].
    const lowerBound = i > 0 ? cutoffs[i - 1] : Number.NEGATIVE_INFINITY;
    const upperBound =
      i < cutoffs.length - 1 ? cutoffs[i + 1] : Number.POSITIVE_INFINITY;
    cutoffs[i] = Math.max(lowerBound, Math.min(upperBound, v));
    update({ cutoffs });
  };

  const setBucketColor = (i: number, color: string) => {
    const buckets = p.cf.buckets.map((b, j) => (j === i ? { ...b, color } : b));
    update({ buckets });
  };

  const addRow = () => {
    const last = p.cf.cutoffs.at(-1) ?? 0;
    const next = last + (last === 0 ? 0.1 : Math.abs(last) * 0.5);
    update({
      cutoffs: [...p.cf.cutoffs, next],
      buckets: [
        ...p.cf.buckets,
        { color: p.cf.buckets.at(-1)?.color ?? "#cccccc" },
      ],
    });
  };

  const removeRow = (i: number) => {
    if (p.cf.buckets.length <= 2) return;
    const cutoffIndex = i === p.cf.buckets.length - 1 ? i - 1 : i;
    const nextBuckets = p.cf.buckets.filter((_, j) => j !== i);
    const nextCutoffs = p.cf.cutoffs.filter((_, j) => j !== cutoffIndex);
    update({ buckets: nextBuckets, cutoffs: nextCutoffs });
  };

  const direction = (): "higher-is-better" | "lower-is-better" =>
    p.cf.direction ?? "higher-is-better";

  const labels = () =>
    deriveBucketLabels(
      p.cf.cutoffs,
      buildAutoValueFormatter(p.cf.cutoffs, p.formatAs),
      direction(),
    );

  return (
    <StyleRevealGroup>
      <Select
        label={t3({ en: "Preset", fr: "Préréglage", pt: "Predefinição" })}
        value={matchedPreset() ?? CUSTOM_PRESET_VALUE}
        options={presetOptions()}
        onChange={applyPreset}
        fullWidth
      />
      <RadioGroup<"higher-is-better" | "lower-is-better">
        label={t3({ en: "Direction", fr: "Direction", pt: "Direção" })}
        options={[
          {
            value: "higher-is-better",
            label: t3({ en: "Higher is better", fr: "Plus élevé = meilleur", pt: "Mais alto é melhor" }),
          },
          {
            value: "lower-is-better",
            label: t3({ en: "Lower is better", fr: "Plus bas = meilleur", pt: "Mais baixo é melhor" }),
          },
        ]}
        value={direction()}
        onChange={(v) =>
          update({ direction: v as "higher-is-better" | "lower-is-better" })
        }
        horizontal
      />
      <div class="flex flex-col gap-1.5">
        <For each={p.cf.buckets.slice().reverse()}>
          {(bucket, j) => {
            // Display order is reversed: highest-values bucket at top.
            // origI maps display index back to the stored bucket index.
            const origI = () => p.cf.buckets.length - 1 - j();
            const cutoffIdx = () => origI() - 1;
            // Both bounds are the format's, not universal: only a percent has
            // a natural floor (0, or -1 when the metric is signed) and a
            // natural ceiling (100%). A count or rate is unbounded either way
            // — m9-02-01's SII values are negative by construction.
            const minVal = () =>
              cutoffIdx() > 0
                ? p.cf.cutoffs[cutoffIdx() - 1]
                : p.formatAs === "percent"
                  ? (p.allowNegative ? -1 : 0)
                  : undefined;
            const maxVal = () =>
              cutoffIdx() < p.cf.cutoffs.length - 1
                ? p.cf.cutoffs[cutoffIdx() + 1]
                : p.formatAs === "percent"
                  ? 1
                  : undefined;
            return (
              <div class="flex items-center gap-2">
                <div class="w-24 flex-none">
                  <Show when={origI() > 0}>
                    <div class="translate-y-1/2">
                      <ValueInput
                        value={p.cf.cutoffs[cutoffIdx()]}
                        onChange={(v) => setCutoff(cutoffIdx(), v)}
                        formatAs={p.formatAs}
                        min={minVal()}
                        max={maxVal()}
                        allowNegative={p.allowNegative}
                      />
                    </div>
                  </Show>
                </div>
                <ColorPicker
                  value={colorToString(bucket.color)}
                  onChange={(v) => setBucketColor(origI(), v)}
                  colorSet="standard"
                />
                <span class="text-base-content-muted text-xs">
                  {labels()[origI()]}
                </span>
                <Show when={p.cf.buckets.length > 2}>
                  <div class="ml-auto">
                    <Button
                      size="sm"
                      iconName="x"
                      intent="neutral"
                      outline
                      onClick={() => removeRow(origI())}
                    />
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
        <button
          type="button"
          class="cursor-pointer text-base-content-muted hover:text-base-content self-start text-xs underline"
          onClick={addRow}
        >
          {t3({ en: "+ Add cutoff", fr: "+ Ajouter un seuil", pt: "+ Adicionar limiar" })}
        </button>
      </div>
    </StyleRevealGroup>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

// One numeric control for a stored value, in the units the user READS it in.
// Percent and rate_per_10k are both stored scaled-down (a fraction, a bare
// rate) while every label beside the control is scaled up, so a raw
// NumberInput on either one silently takes a value 100× / 10,000× off — the
// user types 0.8 for "80%" and stores 0.8 meaning 8,000%.
//
// `max` is optional and stays optional: a count or rate threshold has no
// natural ceiling, and hardcoding 1 made every non-percent figure unable to
// take a threshold above 1.
function ValueInput(p: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  formatAs: IndicatorFormat;
  min?: number;
  max?: number;
  allowNegative?: boolean;
}) {
  return (
    <Show
      when={p.formatAs === "percent"}
      fallback={
        <div class="flex flex-col">
          <NumberInput
            label={p.label}
            value={scaleForInput(p.value, p.formatAs)}
            onChange={(v) => p.onChange(unscaleFromInput(v, p.formatAs))}
            min={p.min === undefined ? undefined : scaleForInput(p.min, p.formatAs)}
            max={p.max === undefined ? undefined : scaleForInput(p.max, p.formatAs)}
          />
          {/* The active unit must be VISIBLE: an "indicator" metric's
              axisFormat is filter-sensitive, so this control can silently
              switch between per-10k and raw units when the displayed
              indicators change. The marker (or its disappearance) is how the
              user sees that switch. */}
          <Show when={p.formatAs === "rate_per_10k"}>
            <span class="text-base-content-muted text-[10px] leading-tight">
              {t3({ en: "per 10k", fr: "pour 10k", pt: "por 10k" })}
            </span>
          </Show>
        </div>
      }
    >
      <PercentSelect
        label={p.label}
        value={p.value}
        onChange={p.onChange}
        min={p.min}
        max={p.max}
        allowNegative={p.allowNegative}
        showPlusPrefix={p.allowNegative}
      />
    </Show>
  );
}

// Mirrors formatRateAuto's scaling on the way in and out — the control shows
// per-10,000 counts because that is what the axis, the labels and the legend
// all show. Rounded to 6 decimals: ×10000 on a stored fraction accumulates
// float error (0.0003 → 2.9999999999999996) that NumberInput's String() would
// otherwise display verbatim in the box the user just typed "3" into.
function scaleForInput(v: number, formatAs: IndicatorFormat): number {
  return formatAs === "rate_per_10k" ? Math.round(v * 10000 * 1e6) / 1e6 : v;
}

function unscaleFromInput(v: number, formatAs: IndicatorFormat): number {
  return formatAs === "rate_per_10k" ? v / 10000 : v;
}

function defaultScaleCf(): ConditionalFormattingScale {
  return {
    type: "scale",
    scale: "rd-yl-gn",
    domain: { kind: "auto" },
    noDataColor: NO_DATA_DEFAULT_SCALE,
  };
}

function defaultThresholdsCf(): ConditionalFormattingThresholds {
  return LEGACY_CF_PRESETS["fmt-90-80"].value;
}

type ScaleEditorState = {
  mode: "preset" | "custom";
  paletteName?: string;
  from?: string;
  mid?: string;
  to?: string;
  reverse: boolean;
};

function parseScale(scale: ContinuousScaleConfig): ScaleEditorState {
  if (typeof scale === "string") {
    if (scale.endsWith(":rev")) {
      return { mode: "preset", paletteName: scale.slice(0, -4), reverse: true };
    }
    return { mode: "preset", paletteName: scale, reverse: false };
  }
  if (Array.isArray(scale)) {
    return {
      mode: "custom",
      from: colorToString(scale[0] ?? "#fee0d2"),
      to: colorToString(scale[scale.length - 1] ?? "#de2d26"),
      reverse: false,
    };
  }
  if ("palette" in scale) {
    return {
      mode: "preset",
      paletteName: scale.palette,
      reverse: scale.reverse ?? false,
    };
  }
  if ("mid" in scale) {
    return {
      mode: "custom",
      from: colorToString(scale.min),
      mid: colorToString(scale.mid),
      to: colorToString(scale.max),
      reverse: scale.reverse ?? false,
    };
  }
  return {
    mode: "custom",
    from: colorToString(scale.min),
    to: colorToString(scale.max),
    reverse: scale.reverse ?? false,
  };
}

function serializeScale(state: ScaleEditorState): ContinuousScaleConfig {
  if (state.mode === "preset") {
    const name = state.paletteName ?? "rd-yl-gn";
    return { palette: name as never, reverse: state.reverse };
  }
  if (state.mid !== undefined) {
    return {
      min: state.from ?? "#fee0d2",
      mid: state.mid,
      max: state.to ?? "#de2d26",
      reverse: state.reverse,
    };
  }
  return {
    min: state.from ?? "#fee0d2",
    max: state.to ?? "#de2d26",
    reverse: state.reverse,
  };
}

function colorToString(c: ColorKeyOrString): string {
  if (typeof c === "string") return c;
  // key-based colors can't be previewed in a ColorPicker — show neutral swatch.
  return "#cccccc";
}

function thresholdsEqual(
  a: ConditionalFormattingThresholds,
  b: ConditionalFormattingThresholds,
): boolean {
  if (a.cutoffs.length !== b.cutoffs.length) return false;
  if (a.buckets.length !== b.buckets.length) return false;
  for (let i = 0; i < a.cutoffs.length; i++) {
    if (a.cutoffs[i] !== b.cutoffs[i]) return false;
  }
  for (let i = 0; i < a.buckets.length; i++) {
    if (
      JSON.stringify(a.buckets[i].color) !== JSON.stringify(b.buckets[i].color)
    ) {
      return false;
    }
  }
  return true;
}
