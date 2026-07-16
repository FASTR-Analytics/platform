import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  Select,
  getTruncatedString,
  createFormAction,
} from "panther";
import { Show, createMemo, createSignal } from "solid-js";
import {
  t3,
  TC,
  isValidCalculatedIndicatorIdentifier,
  POPULATION_TYPES,
  type CommonIndicatorWithMappings,
  type CalculatedIndicator,
  type PopulationType,
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
      prefill?: CalculatedIndicator;
    },
    undefined
  >,
) {
  const mode = p.existing ? "update" : "create";
  const initial = p.existing ?? p.prefill;

  const [calculatedIndicatorId, setCalculatedIndicatorId] = createSignal(
    initial?.calculated_indicator_id ?? "",
  );
  const [label, setLabel] = createSignal(initial?.label ?? "");
  const [groupLabel, setGroupLabel] = createSignal(
    initial?.group_label ?? "",
  );

  const [numIndicatorId, setNumIndicatorId] = createSignal(
    initial?.num_indicator_id ?? "",
  );
  const [denomKind, setDenomKind] = createSignal<"none" | "indicator" | "population">(
    initial?.denom.kind ?? "none",
  );
  const [denomIndicatorId, setDenomIndicatorId] = createSignal(
    initial?.denom.kind === "indicator" ? initial.denom.indicator_id : "",
  );
  const [denomPopulationType, setDenomPopulationType] =
    createSignal<PopulationType>(
      initial?.denom.kind === "population"
        ? initial.denom.population_type
        : "total_population",
    );
  const [denomPopulationMultiplier, setDenomPopulationMultiplier] =
    createSignal(
      initial?.denom.kind === "population"
        ? String(initial.denom.multiplier)
        : "1",
    );

  const [formatAs, setFormatAs] = createSignal<FormatAs>(
    initial?.format_as ?? "percent",
  );
  const [thresholdDirection, setThresholdDirection] =
    createSignal<ThresholdDirection>(
      initial?.threshold_direction ?? "higher_is_better",
    );
  const [thresholdGreen, setThresholdGreen] = createSignal(
    String(initial?.threshold_green ?? 80),
  );
  const [thresholdYellow, setThresholdYellow] = createSignal(
    String(initial?.threshold_yellow ?? 70),
  );

  const idValidationError = createMemo(() => {
    const id = calculatedIndicatorId().trim();
    if (!id || mode === "update") return null;
    if (!isValidCalculatedIndicatorIdentifier(id)) {
      return t3({
        en: "Must start with lowercase letter, only a-z, 0-9, _ allowed",
        fr: "Doit commencer par une lettre minuscule, seuls a-z, 0-9, _ sont autorisés",
        pt: "Deve começar por uma letra minúscula; apenas a-z, 0-9 e _ são permitidos",
      });
    }
    return null;
  });

  const numIdError = createMemo(() => {
    const id = numIndicatorId();
    if (!id || isValidCalculatedIndicatorIdentifier(id)) {
      return undefined;
    }
    return unusableCommonIdMessage();
  });

  const denomIdError = createMemo(() => {
    const kind = denomKind();
    const id = denomIndicatorId();
    if (kind !== "indicator" || !id || isValidCalculatedIndicatorIdentifier(id)) {
      return undefined;
    }
    return unusableCommonIdMessage();
  });

  const commonIndicatorOptions = () => [
    {
      value: "",
      label: t3({
        en: "Select an indicator...",
        fr: "Sélectionner un indicateur...",
        pt: "Selecionar um indicador...",
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
    const fmt = formatAs();
    if (fmt === "percent") {
      return `${(previewRawValue * 100).toFixed(0)}%`;
    }
    if (fmt === "rate_per_10k") {
      const value = (previewRawValue * 10000).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      return `${value} ${t3({ en: "per 10k", fr: "pour 10k" })}`;
    }
    return previewRawValue.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  });

  const save = createFormAction(
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
            pt: "O ID do indicador calculado é obrigatório",
          }),
        };
      }
      if (mode === "create" && !isValidCalculatedIndicatorIdentifier(id)) {
        return {
          success: false,
          err: t3({
            en: "ID must start with a lowercase letter and contain only lowercase letters, numbers, and underscores (max 64 chars)",
            fr: "L'ID doit commencer par une lettre minuscule et ne contenir que des lettres minuscules, des chiffres et des tirets bas (max 64 caractères)",
            pt: "O ID deve começar por uma letra minúscula e conter apenas letras minúsculas, números e sublinhados (máx. 64 caracteres)",
          }),
        };
      }
      if (!lbl) {
        return {
          success: false,
          err: t3({ en: "Label is required", fr: "Le libellé est requis", pt: "A etiqueta é obrigatória" }),
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
            pt: "Outro indicador calculado já utiliza esta etiqueta",
          }),
        };
      }

      if (!numIndicatorId().trim()) {
        return {
          success: false,
          err: t3({
            en: "Numerator indicator is required",
            fr: "L'indicateur du numérateur est requis",
            pt: "O indicador do numerador é obrigatório",
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
            pt: "O numerador deve referenciar um indicador comum existente",
          }),
        };
      }
      const numErr = numIdError();
      if (numErr) {
        return { success: false, err: numErr };
      }

      let denom: CalculatedIndicator["denom"];
      if (denomKind() === "none") {
        denom = { kind: "none" };
      } else if (denomKind() === "indicator") {
        const denomId = denomIndicatorId().trim();
        if (!denomId) {
          return {
            success: false,
            err: t3({
              en: "Denominator indicator is required",
              fr: "L'indicateur du dénominateur est requis",
              pt: "O indicador do denominador é obrigatório",
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
              pt: "O denominador deve referenciar um indicador comum existente",
            }),
          };
        }
        const denomErr = denomIdError();
        if (denomErr) {
          return { success: false, err: denomErr };
        }
        denom = { kind: "indicator", indicator_id: denomId };
      } else {
        const multiplier = Number(denomPopulationMultiplier());
        if (!Number.isFinite(multiplier) || multiplier <= 0) {
          return {
            success: false,
            err: t3({
              en: "Population multiplier must be a positive number",
              fr: "Le multiplicateur de population doit être un nombre positif",
              pt: "O multiplicador de população deve ser um número positivo",
            }),
          };
        }
        denom = {
          kind: "population",
          population_type: denomPopulationType(),
          multiplier,
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
            pt: "Os limiares devem ser números",
          }),
        };
      }

      const indicator: CalculatedIndicator = {
        calculated_indicator_id: id,
        label: lbl,
        group_label: groupLabel().trim(),
        sort_order: p.existing
          ? p.existing.sort_order
          : p.existingCalculatedIndicators.reduce(
              (max, si) => Math.max(max, si.sort_order),
              0,
            ) + 1,
        num_indicator_id: numIndicatorId(),
        denom,
        format_as: formatAs(),
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
              pt: "Adicionar indicador calculado",
            })
          : t3({
              en: "Update Calculated indicator",
              fr: "Mettre à jour l'indicateur calculé",
              pt: "Atualizar indicador calculado",
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
              pt: "ID do indicador calculado",
            })}
            value={calculatedIndicatorId()}
            onChange={setCalculatedIndicatorId}
            fullWidth
            autoFocus={mode === "create"}
            mono
            disabled={mode === "update"}
          />
          <Show when={idValidationError()}>
            <div class="text-danger -mt-1 text-xs">{idValidationError()}</div>
          </Show>
          <Input
            label={t3(TC.label)}
            value={label()}
            onChange={setLabel}
            fullWidth
          />
        </div>

        <div class="ui-spy-sm">
          <div class="font-700 text-sm">
            {t3({ en: "Numerator", fr: "Numérateur", pt: "Numerador" })}
          </div>
          <Select
            label={t3({ en: "Indicator", fr: "Indicateur", pt: "Indicador" })}
            value={numIndicatorId()}
            onChange={setNumIndicatorId}
            options={commonIndicatorOptions()}
            fullWidth
          />
          <Show when={numIdError()}>
            <div class="text-danger -mt-1 text-xs">{numIdError()}</div>
          </Show>
        </div>

        <div class="ui-spy-sm">
          <div class="font-700 text-sm">
            {t3({ en: "Denominator", fr: "Dénominateur", pt: "Denominador" })}
          </div>
          <RadioGroup<"none" | "indicator" | "population">
            label={t3({ en: "Denominator kind", fr: "Type de dénominateur", pt: "Tipo de denominador" })}
            value={denomKind()}
            onChange={(v) => setDenomKind(v as "none" | "indicator" | "population")}
            options={[
              {
                value: "none",
                label: t3({
                  en: "None (raw count)",
                  fr: "Aucun (compte brut)",
                  pt: "Nenhum (contagem bruta)",
                }),
              },
              {
                value: "indicator",
                label: t3({
                  en: "Another indicator",
                  fr: "Un autre indicateur",
                  pt: "Outro indicador",
                }),
              },
              {
                value: "population",
                label: t3({
                  en: "Population-based",
                  fr: "Basé sur la population",
                  pt: "Baseado na população",
                }),
              },
            ]}
          />
          <Show when={denomKind() === "indicator"}>
            <Select
              label={t3({
                en: "Denominator indicator",
                fr: "Indicateur du dénominateur",
                pt: "Indicador do denominador",
              })}
              value={denomIndicatorId()}
              onChange={setDenomIndicatorId}
              options={commonIndicatorOptions()}
              fullWidth
            />
            <Show when={denomIdError()}>
              <div class="text-danger -mt-1 text-xs">{denomIdError()}</div>
            </Show>
          </Show>
          <Show when={denomKind() === "population"}>
            <Select
              label={t3({
                en: "Population type",
                fr: "Type de population",
                pt: "Tipo de população",
              })}
              value={denomPopulationType()}
              onChange={(v) => setDenomPopulationType(v as PopulationType)}
              options={POPULATION_TYPES.map((pt) => ({
                value: pt.id,
                label: t3(pt.label),
              }))}
              fullWidth
            />
            <Input
              label={t3({
                en: "Multiplier (usually 1). Module applies period scaling.",
                fr: "Multiplicateur (généralement 1). Le module applique la mise à l'échelle de la période.",
                pt: "Multiplicador (geralmente 1). O módulo aplica o ajuste de escala do período.",
              })}
              value={denomPopulationMultiplier()}
              onChange={setDenomPopulationMultiplier}
              type="number"
            />
          </Show>
        </div>

        <div class="ui-spy-sm">
          <div class="font-700 text-sm">
            {t3({ en: "Formatting", fr: "Format", pt: "Formatação" })}
          </div>
          <Select
            label={t3({ en: "Format", fr: "Format", pt: "Formato" })}
            value={formatAs()}
            onChange={(v) => setFormatAs(v as FormatAs)}
            options={[
              {
                value: "percent",
                label: t3({ en: "Percent", fr: "Pourcentage", pt: "Percentagem" }),
              },
              { value: "number", label: t3({ en: "Number", fr: "Nombre", pt: "Número" }) },
              {
                value: "rate_per_10k",
                label: t3({ en: "Rate per 10,000", fr: "Taux pour 10 000", pt: "Taxa por 10 000" }),
              },
            ]}
            fullWidth
          />
          <div class="text-base-content/70 ui-form-text">
            {t3({ en: "Preview", fr: "Aperçu", pt: "Pré-visualização" })}:{" "}
            <span class="font-mono">{previewFormatted()}</span>
          </div>
        </div>

        <div class="ui-spy-sm">
          <div class="font-700 text-sm">
            {t3({ en: "Thresholds", fr: "Seuils", pt: "Limiares" })}
          </div>
          <RadioGroup<ThresholdDirection>
            label={t3({ en: "Direction", fr: "Direction", pt: "Direção" })}
            value={thresholdDirection()}
            onChange={(v) => setThresholdDirection(v as ThresholdDirection)}
            options={[
              {
                value: "higher_is_better",
                label: t3({
                  en: "Higher is better",
                  fr: "Plus haut est meilleur",
                  pt: "Mais alto é melhor",
                }),
              },
              {
                value: "lower_is_better",
                label: t3({
                  en: "Lower is better",
                  fr: "Plus bas est meilleur",
                  pt: "Mais baixo é melhor",
                }),
              },
            ]}
            horizontal
          />
          <Input
            label={t3({
              en: "Green cutoff (in displayed scale)",
              fr: "Seuil vert (en échelle affichée)",
              pt: "Limiar verde (na escala apresentada)",
            })}
            value={thresholdGreen()}
            onChange={setThresholdGreen}
            type="number"
          />
          <Input
            label={t3({
              en: "Yellow cutoff (in displayed scale)",
              fr: "Seuil jaune (en échelle affichée)",
              pt: "Limiar amarelo (na escala apresentada)",
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

function unusableCommonIdMessage(): string {
  return t3({
    en: "This indicator's ID contains characters that cannot be used in calculations. Only IDs starting with a lowercase letter and containing only lowercase letters, numbers, and underscores can be used.",
    fr: "L'ID de cet indicateur contient des caractères qui ne peuvent pas être utilisés dans les calculs. Seuls les ID commençant par une lettre minuscule et ne contenant que des lettres minuscules, des chiffres et des tirets bas peuvent être utilisés.",
    pt: "O ID deste indicador contém caracteres que não podem ser utilizados em cálculos. Apenas os ID que começam por uma letra minúscula e contêm apenas letras minúsculas, números e sublinhados podem ser utilizados.",
  });
}
