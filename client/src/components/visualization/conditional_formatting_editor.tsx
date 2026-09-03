import {
  type ConditionalFormatting,
  type ConditionalFormattingScale,
  type DisplayedRule,
  LEGACY_CF_PRESET_IDS,
  LEGACY_CF_PRESETS,
  type LegacyCfPresetId,
  bucketLabels,
  getLanguage,
  type IndicatorFormat,
  legendBucketOrder,
  scaleValueForFormat,
  t3,
  type ThresholdDirection,
  type ThresholdsRule,
  unscaleValueForFormat,
} from "lib";
import {
  Button,
  ButtonGroup,
  Checkbox,
  ColorPicker,
  type ColorKeyOrString,
  type ContinuousScaleConfig,
  Input,
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
  // Present only for an "indicator" metric (its values are each indicator's
  // own quantity): offers the `indicator` source and lists the displayed
  // indicators' own rules read-only beside it.
  indicatorSource?: DisplayedRule[];
};

type Mode = ConditionalFormatting["type"];

const NO_DATA_DEFAULT_SCALE = "#f0f0f0";

export function ConditionalFormattingEditor(p: Props) {
  const cf = (): ConditionalFormatting => p.value ?? { type: "none" };

  const handleModeChange = (mode: Mode | undefined) => {
    if (!mode || mode === "none") {
      p.onChange({ type: "none" });
      return;
    }
    if (mode === "indicator") {
      p.onChange({ type: "indicator" });
      return;
    }
    if (mode === "scale") {
      p.onChange(cf().type === "scale" ? cf() : defaultScaleCf());
      return;
    }
    p.onChange(cf().type === "thresholds" ? cf() : defaultThresholdsCf());
  };

  const modeItems = () => [
    { id: "none" as const, label: t3({ en: "Off", fr: "Désactivé", pt: "Desativado" }) },
    ...(p.indicatorSource
      ? [{
        id: "indicator" as const,
        label: t3({ en: "Indicator", fr: "Indicateur", pt: "Indicador" }),
      }]
      : []),
    { id: "scale" as const, label: t3({ en: "Scale", fr: "Échelle", pt: "Escala" }) },
    {
      id: "thresholds" as const,
      label: t3({ en: "Thresholds", fr: "Seuils", pt: "Limiares" }),
    },
  ];

  return (
    <div class="ui-spy-sm">
      <ButtonGroup<Mode>
        items={modeItems()}
        value={cf().type}
        onChange={handleModeChange}
        size="sm"
      />
      <Show when={cf().type === "indicator" && p.indicatorSource}>
        {(rules) => <IndicatorRulesListing rules={rules()} />}
      </Show>
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
          cf={cf() as ThresholdsRule}
          onChange={(rule) => p.onChange({ type: "thresholds", ...rule })}
          formatAs={p.formatAs}
          decimalPlaces={p.decimalPlaces}
          allowNegative={p.allowNegative}
          showLabels={false}
          showPresets={true}
        />
      </Show>
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// Indicator source — the displayed indicators' own rules, read-only
////////////////////////////////////////////////////////////////////////////////

function IndicatorRulesListing(p: { rules: DisplayedRule[] }) {
  return (
    <StyleRevealGroup>
      <div class="text-base-content-muted text-xs">
        {t3({
          en: "Each value is coloured by its own indicator's rule, set in the instance indicator dictionary.",
          fr: "Chaque valeur est colorée selon la règle de son propre indicateur, définie dans le dictionnaire d'indicateurs de l'instance.",
          pt: "Cada valor é colorido pela regra do seu próprio indicador, definida no dicionário de indicadores da instância.",
        })}
      </div>
      <Show
        when={p.rules.length > 0}
        fallback={
          <div class="text-base-content-muted text-xs">
            {t3({
              en: "None of the displayed indicators has a rule.",
              fr: "Aucun des indicateurs affichés n'a de règle.",
              pt: "Nenhum dos indicadores apresentados tem uma regra.",
            })}
          </div>
        }
      >
        <For each={p.rules}>
          {({ rule, formatAs }) => {
            const labels = () =>
              bucketLabels(
                rule,
                buildAutoValueFormatter(rule.cutoffs, formatAs),
                getLanguage(),
              );
            return (
              <div class="flex flex-col gap-1">
                <For each={legendBucketOrder(rule)}>
                  {(i) => (
                    <div class="flex items-center gap-2">
                      <span
                        class="inline-block h-4 w-4 flex-none rounded border"
                        style={{ "background-color": colorToString(rule.buckets[i].color) }}
                      />
                      <span class="text-base-content-muted text-xs">
                        {labels()[i]}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            );
          }}
        </For>
      </Show>
    </StyleRevealGroup>
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
// Thresholds panel — shared by the figure CF editor and the instance
// indicator editor. Presents DISPLAY units, stores STORED units.
////////////////////////////////////////////////////////////////////////////////

const CUSTOM_PRESET_VALUE = "__custom__";

export function ThresholdsPanel(p: {
  cf: ThresholdsRule;
  onChange: (v: ThresholdsRule) => void;
  formatAs: IndicatorFormat;
  decimalPlaces: number;
  allowNegative?: boolean;
  showLabels: boolean;
  showPresets: boolean;
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
    if (preset) {
      const { type: _type, ...rule } = preset.value;
      p.onChange(rule);
    }
  };

  const update = (patch: Partial<ThresholdsRule>) => {
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

  const setBucketLabel = (i: number, label: string) => {
    const buckets = p.cf.buckets.map((b, j) => {
      if (j !== i) return b;
      const { label: _old, ...rest } = b;
      return label.trim() === "" ? rest : { ...rest, label };
    });
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

  const direction = (): ThresholdDirection =>
    p.cf.direction ?? "higher-is-better";

  const labels = () =>
    bucketLabels(
      p.cf,
      buildAutoValueFormatter(p.cf.cutoffs, p.formatAs),
      getLanguage(),
    );

  return (
    <StyleRevealGroup>
      <Show when={p.showPresets}>
        <Select
          label={t3({ en: "Preset", fr: "Préréglage", pt: "Predefinição" })}
          value={matchedPreset() ?? CUSTOM_PRESET_VALUE}
          options={presetOptions()}
          onChange={applyPreset}
          fullWidth
        />
      </Show>
      <RadioGroup<ThresholdDirection>
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
        onChange={(v) => update({ direction: v as ThresholdDirection })}
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
                <Show
                  when={p.showLabels}
                  fallback={
                    <span class="text-base-content-muted text-xs">
                      {labels()[origI()]}
                    </span>
                  }
                >
                  <div class="flex-1">
                    <Input
                      value={bucket.label ?? ""}
                      onChange={(v) => setBucketLabel(origI(), v)}
                      placeholder={labels()[origI()]}
                      fullWidth
                    />
                  </div>
                </Show>
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
            value={scaleValueForFormat(p.value, p.formatAs)}
            onChange={(v) => p.onChange(unscaleValueForFormat(v, p.formatAs))}
            min={p.min === undefined ? undefined : scaleValueForFormat(p.min, p.formatAs)}
            max={p.max === undefined ? undefined : scaleValueForFormat(p.max, p.formatAs)}
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

function defaultScaleCf(): ConditionalFormattingScale {
  return {
    type: "scale",
    scale: "rd-yl-gn",
    domain: { kind: "auto" },
    noDataColor: NO_DATA_DEFAULT_SCALE,
  };
}

function defaultThresholdsCf(): ConditionalFormatting {
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

function thresholdsEqual(a: ThresholdsRule, b: ThresholdsRule): boolean {
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
