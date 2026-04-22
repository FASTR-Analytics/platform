import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  Select,
  getTruncatedString,
  timActionForm,
} from "panther";
import { Show, createMemo, createSignal } from "solid-js";
import {
  t3,
  TC,
  type CommonIndicatorWithMappings,
  type CalculatedIndicator,
} from "lib";
import { serverActions } from "~/server_actions";

type FormatAs = CalculatedIndicator["format_as"];
type ThresholdDirection = CalculatedIndicator["threshold_direction"];

export function EditCalculatedIndicatorForm(
  p: AlertComponentProps<
    {
      commonIndicators: CommonIndicatorWithMappings[];
      existingCalculatedIndicators: CalculatedIndicator[];
      existing?: CalculatedIndicator;
    },
    undefined
  >,
) {
  const mode = p.existing ? "update" : "create";

  const [calculatedIndicatorId, setCalculatedIndicatorId] = createSignal(
    p.existing?.calculated_indicator_id ?? "",
  );
  const [label, setLabel] = createSignal(p.existing?.label ?? "");
  const [groupLabel, setGroupLabel] = createSignal(
    p.existing?.group_label ?? "",
  );
  const [sortOrder, setSortOrder] = createSignal(
    String(p.existing?.sort_order ?? 0),
  );

  const [numIndicatorId, setNumIndicatorId] = createSignal(
    p.existing?.num_indicator_id ?? "",
  );
  const [denomKind, setDenomKind] = createSignal<"indicator" | "population">(
    p.existing?.denom.kind ?? "indicator",
  );
  const [denomIndicatorId, setDenomIndicatorId] = createSignal(
    p.existing?.denom.kind === "indicator" ? p.existing.denom.indicator_id : "",
  );
  const [denomPopulationFraction, setDenomPopulationFraction] = createSignal(
    p.existing?.denom.kind === "population"
      ? String(p.existing.denom.population_fraction)
      : "",
  );

  const [formatAs, setFormatAs] = createSignal<FormatAs>(
    p.existing?.format_as ?? "percent",
  );
  const [decimalPlaces, setDecimalPlaces] = createSignal(
    String(p.existing?.decimal_places ?? 0),
  );

  const [thresholdDirection, setThresholdDirection] =
    createSignal<ThresholdDirection>(
      p.existing?.threshold_direction ?? "higher_is_better",
    );
  const [thresholdGreen, setThresholdGreen] = createSignal(
    String(p.existing?.threshold_green ?? 80),
  );
  const [thresholdYellow, setThresholdYellow] = createSignal(
    String(p.existing?.threshold_yellow ?? 70),
  );

  const commonIndicatorOptions = () => [
    {
      value: "",
      label: t3({
        en: "Select an indicator...",
        fr: "Sélectionner un indicateur...",
      }),
    },
    ...p.commonIndicators.map((ci) => ({
      value: ci.indicator_common_id,
      label: `${ci.indicator_common_id} ~ ${getTruncatedString(ci.indicator_common_label, 30)}`,
    })),
  ];

  // ---- Live preview ----
  const previewRawValue = 0.73;
  const previewFormatted = createMemo(() => {
    const dp = Number(decimalPlaces()) || 0;
    const fmt = formatAs();
    if (fmt === "percent") {
      return `${(previewRawValue * 100).toFixed(dp)}%`;
    }
    if (fmt === "rate_per_10k") {
      return `${(previewRawValue * 10000).toLocaleString(undefined, {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      })} per 10k`;
    }
    return previewRawValue.toLocaleString(undefined, {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    });
  });

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      const id = calculatedIndicatorId().trim();
      const lbl = label().trim();

      if (mode === "create" && !id) {
        return {
          success: false,
          err: t3({
            en: "Calculated indicator ID is required",
            fr: "L'identifiant est requis",
          }),
        };
      }
      if (!lbl) {
        return {
          success: false,
          err: t3({ en: "Label is required", fr: "Le libellé est requis" }),
        };
      }

      // Label uniqueness (exclude self on edit)
      const labelConflict = p.existingCalculatedIndicators.find(
        (si) =>
          si.label === lbl &&
          si.calculated_indicator_id !== p.existing?.calculated_indicator_id,
      );
      if (labelConflict) {
        return {
          success: false,
          err: t3({
            en: "Another calculated indicator already uses this label",
            fr: "Un autre indicateur calculé utilise déjà ce libellé",
          }),
        };
      }

      if (!numIndicatorId().trim()) {
        return {
          success: false,
          err: t3({
            en: "Numerator indicator is required",
            fr: "L'indicateur du numérateur est requis",
          }),
        };
      }
      const numResolved = p.commonIndicators.some(
        (ci) => ci.indicator_common_id === numIndicatorId(),
      );
      if (!numResolved) {
        return {
          success: false,
          err: t3({
            en: "Numerator must reference an existing common indicator",
            fr: "Le numérateur doit référencer un indicateur commun existant",
          }),
        };
      }

      let denom: CalculatedIndicator["denom"];
      if (denomKind() === "indicator") {
        const denomId = denomIndicatorId().trim();
        if (!denomId) {
          return {
            success: false,
            err: t3({
              en: "Denominator indicator is required",
              fr: "L'indicateur du dénominateur est requis",
            }),
          };
        }
        const denomResolved = p.commonIndicators.some(
          (ci) => ci.indicator_common_id === denomId,
        );
        if (!denomResolved) {
          return {
            success: false,
            err: t3({
              en: "Denominator must reference an existing common indicator",
              fr: "Le dénominateur doit référencer un indicateur commun existant",
            }),
          };
        }
        denom = { kind: "indicator", indicator_id: denomId };
      } else {
        const fraction = Number(denomPopulationFraction());
        if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
          return {
            success: false,
            err: t3({
              en: "Population fraction must be a positive number ≤ 1",
              fr: "La fraction de population doit être un nombre positif ≤ 1",
            }),
          };
        }
        denom = { kind: "population", population_fraction: fraction };
      }

      const dp = Number(decimalPlaces());
      if (!Number.isFinite(dp) || dp < 0 || dp > 3) {
        return {
          success: false,
          err: t3({
            en: "Decimal places must be 0–3",
            fr: "Les décimales doivent être entre 0 et 3",
          }),
        };
      }

      const green = Number(thresholdGreen());
      const yellow = Number(thresholdYellow());
      if (!Number.isFinite(green) || !Number.isFinite(yellow)) {
        return {
          success: false,
          err: t3({
            en: "Threshold cutoffs must be numbers",
            fr: "Les seuils doivent être des nombres",
          }),
        };
      }

      const indicator: CalculatedIndicator = {
        calculated_indicator_id: id,
        label: lbl,
        group_label: groupLabel().trim(),
        sort_order: Number(sortOrder()) || 0,
        num_indicator_id: numIndicatorId(),
        denom,
        format_as: formatAs(),
        decimal_places: dp,
        threshold_direction: thresholdDirection(),
        threshold_green: green,
        threshold_yellow: yellow,
      };

      if (mode === "create") {
        return await serverActions.createCalculatedIndicator({ indicator });
      }
      return await serverActions.updateCalculatedIndicator({
        oldCalculatedIndicatorId: p.existing!.calculated_indicator_id,
        indicator,
      });
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="calculated-indicator-form"
      header={
        mode === "create"
          ? t3({
              en: "Add Calculated indicator",
              fr: "Ajouter un indicateur calculé",
            })
          : t3({
              en: "Update Calculated indicator",
              fr: "Mettre à jour l'indicateur calculé",
            })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <div class="ui-spy-sm">
          <Input
            label={t3({
              en: "Calculated indicator ID",
              fr: "ID de l'indicateur",
            })}
            value={calculatedIndicatorId()}
            onChange={setCalculatedIndicatorId}
            fullWidth
            autoFocus={mode === "create"}
            mono
            disabled={mode === "update"}
          />
          <Input
            label={t3(TC.label)}
            value={label()}
            onChange={setLabel}
            fullWidth
          />
          <Input
            label={t3({ en: "Group label", fr: "Libellé du groupe" })}
            value={groupLabel()}
            onChange={setGroupLabel}
            fullWidth
          />
          <Input
            label={t3({ en: "Sort order", fr: "Ordre de tri" })}
            value={sortOrder()}
            onChange={setSortOrder}
            type="number"
          />
        </div>

        <div class="ui-spy-sm">
          <div class="font-700 text-sm">
            {t3({ en: "Numerator", fr: "Numérateur" })}
          </div>
          <Select
            label={t3({ en: "Indicator", fr: "Indicateur" })}
            value={numIndicatorId()}
            onChange={setNumIndicatorId}
            options={commonIndicatorOptions()}
            fullWidth
          />
        </div>

        <div class="ui-spy-sm">
          <div class="font-700 text-sm">
            {t3({ en: "Denominator", fr: "Dénominateur" })}
          </div>
          <RadioGroup<"indicator" | "population">
            label={t3({ en: "Denominator kind", fr: "Type de dénominateur" })}
            value={denomKind()}
            onChange={(v) => setDenomKind(v as "indicator" | "population")}
            options={[
              {
                value: "indicator",
                label: t3({
                  en: "Another indicator",
                  fr: "Un autre indicateur",
                }),
              },
              {
                value: "population",
                label: t3({
                  en: "Population-based",
                  fr: "Basé sur la population",
                }),
              },
            ]}
            horizontal
          />
          <Show when={denomKind() === "indicator"}>
            <Select
              label={t3({
                en: "Denominator indicator",
                fr: "Indicateur du dénominateur",
              })}
              value={denomIndicatorId()}
              onChange={setDenomIndicatorId}
              options={commonIndicatorOptions()}
              fullWidth
            />
          </Show>
          <Show when={denomKind() === "population"}>
            <Input
              label={t3({
                en: "Population fraction (annual, 0–1). Module applies period scaling.",
                fr: "Fraction annuelle de la population (0–1). Le module applique la mise à l'échelle de la période.",
              })}
              value={denomPopulationFraction()}
              onChange={setDenomPopulationFraction}
              type="number"
            />
          </Show>
        </div>

        <div class="ui-spy-sm">
          <div class="font-700 text-sm">
            {t3({ en: "Formatting", fr: "Format" })}
          </div>
          <Select
            label={t3({ en: "Format", fr: "Format" })}
            value={formatAs()}
            onChange={(v) => setFormatAs(v as FormatAs)}
            options={[
              {
                value: "percent",
                label: t3({ en: "Percent", fr: "Pourcentage" }),
              },
              { value: "number", label: t3({ en: "Number", fr: "Nombre" }) },
              {
                value: "rate_per_10k",
                label: t3({ en: "Rate per 10,000", fr: "Taux pour 10 000" }),
              },
            ]}
            fullWidth
          />
          <RadioGroup
            label={t3({ en: "Decimal places", fr: "Décimales" })}
            value={decimalPlaces()}
            onChange={setDecimalPlaces}
            options={[
              { value: "0", label: "0" },
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
            ]}
            horizontal
          />
          <div class="text-base-content/70 ui-form-text">
            {t3({ en: "Preview", fr: "Aperçu" })}:{" "}
            <span class="font-mono">{previewFormatted()}</span>
          </div>
        </div>

        <div class="ui-spy-sm">
          <div class="font-700 text-sm">
            {t3({ en: "Thresholds", fr: "Seuils" })}
          </div>
          <RadioGroup<ThresholdDirection>
            label={t3({ en: "Direction", fr: "Direction" })}
            value={thresholdDirection()}
            onChange={(v) => setThresholdDirection(v as ThresholdDirection)}
            options={[
              {
                value: "higher_is_better",
                label: t3({
                  en: "Higher is better",
                  fr: "Plus haut est meilleur",
                }),
              },
              {
                value: "lower_is_better",
                label: t3({
                  en: "Lower is better",
                  fr: "Plus bas est meilleur",
                }),
              },
            ]}
            horizontal
          />
          <Input
            label={t3({
              en: "Green cutoff (in displayed scale)",
              fr: "Seuil vert (en échelle affichée)",
            })}
            value={thresholdGreen()}
            onChange={setThresholdGreen}
            type="number"
          />
          <Input
            label={t3({
              en: "Yellow cutoff (in displayed scale)",
              fr: "Seuil jaune (en échelle affichée)",
            })}
            value={thresholdYellow()}
            onChange={setThresholdYellow}
            type="number"
          />
        </div>
      </div>
    </AlertFormHolder>
  );
}
