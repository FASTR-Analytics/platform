// Form component for create/update
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Input,
  Select,
  getTruncatedString,
  getUnique,
  createFormAction,
} from "panther";
import { For, createSignal } from "solid-js";
import {
  t3,
  TC,
  getNewIndicatorIdIssue,
  type CommonIndicatorWithMappings,
  type RawIndicatorWithMappings,
} from "lib";
import { serverActions } from "~/server_actions";

export function EditIndicatorCommonForm(
  p: AlertComponentProps<
    {
      rawIndicators: RawIndicatorWithMappings[];
      existingCommonIndicator?: CommonIndicatorWithMappings;
    },
    undefined
  >,
) {
  const mode = p.existingCommonIndicator ? "update" : "create";

  const [indicatorCommonId, setIndicatorCommonId] = createSignal(
    p.existingCommonIndicator?.indicator_common_id || "",
  );
  const [indicatorLabel, setIndicatorLabel] = createSignal(
    p.existingCommonIndicator?.indicator_common_label || "",
  );
  const [mappedRawIds, setMappedRawIds] = createSignal<string[]>(
    p.existingCommonIndicator?.raw_indicator_ids ?? [],
  );

  function addMappedRawId() {
    setMappedRawIds([...mappedRawIds(), ""]);
  }

  function removeMappedRawId(index: number) {
    const current = mappedRawIds();
    setMappedRawIds(current.filter((_, i) => i !== index));
  }

  function updateMappedRawId(index: number, value: string) {
    const current = mappedRawIds();
    const updated = [...current];
    updated[index] = value;
    setMappedRawIds(updated);
  }

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      const commonId = indicatorCommonId().trim();
      const label = indicatorLabel().trim();

      if (mode === "create" && !commonId) {
        return { success: false, err: t3({ en: "Indicator ID is required", fr: "L'identifiant de l'indicateur est requis", pt: "O ID do indicador é obrigatório" }) };
      }

      if (mode === "create" && getNewIndicatorIdIssue(commonId)) {
        return {
          success: false,
          err: t3({
            en: "Indicator ID must not contain commas, semicolons, or colons, and must be at most 128 characters",
            fr: "L'identifiant de l'indicateur ne doit pas contenir de virgules, de points-virgules ou de deux-points, et doit comporter au maximum 128 caractères",
            pt: "O ID do indicador não pode conter vírgulas, pontos e vírgulas ou dois pontos, e deve ter no máximo 128 caracteres",
          }),
        };
      }

      if (!label) {
        return { success: false, err: t3({ en: "Indicator label is required", fr: "Le libellé de l'indicateur est requis", pt: "A etiqueta do indicador é obrigatória" }) };
      }

      const filteredMappedRawIds = getUnique(
        mappedRawIds().filter((id) => id.trim() !== ""),
      );

      if (mode === "create") {
        return await serverActions.createCommonIndicators({
          indicators: [
            {
              indicator_common_id: commonId,
              indicator_common_label: label,
              mapped_raw_ids: filteredMappedRawIds,
            },
          ],
        });
      } else {
        return await serverActions.updateCommonIndicator({
          old_indicator_common_id:
            p.existingCommonIndicator!.indicator_common_id,
          new_indicator_common_id: commonId,
          indicator_common_label: label,
          mapped_raw_ids: filteredMappedRawIds,
        });
      }
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="indicator-form"
      header={
        mode === "create"
          ? t3({ en: "Add Common Indicator", fr: "Ajouter un indicateur commun", pt: "Adicionar indicador comum" })
          : t3({ en: "Update Common Indicator", fr: "Mettre à jour l'indicateur commun", pt: "Atualizar indicador comum" })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <Input
        label={t3({ en: "Common ID", fr: "ID commun", pt: "ID comum" })}
        value={indicatorCommonId()}
        onChange={setIndicatorCommonId}
        fullWidth
        autoFocus={mode === "create"}
        mono
        disabled={mode === "update"}
      />
      <Input
        label={t3(TC.label)}
        value={indicatorLabel()}
        onChange={setIndicatorLabel}
        fullWidth
      />
      <div class="ui-spy-sm">
        <div class="font-700 text-base-content text-sm">
          {t3({ en: "Mapped DHIS2 Indicators (JSON IDs)", fr: "Indicateurs DHIS2 associés (ID JSON)", pt: "Indicadores DHIS2 associados (ID JSON)" })}
        </div>
        <For each={mappedRawIds()}>
          {(rawId, index) => (
            <div class="ui-gap-sm flex items-center">
              <Select
                value={rawId}
                onChange={(value) => updateMappedRawId(index(), value)}
                options={[
                  { value: "", label: t3({ en: "Select DHIS2 indicator...", fr: "Sélectionner un indicateur DHIS2...", pt: "Selecionar um indicador DHIS2..." }) },
                  ...p.rawIndicators.map((raw) => ({
                    value: raw.raw_indicator_id,
                    label: `${raw.raw_indicator_id} ~ ${getTruncatedString(raw.raw_indicator_label, 30)}`,
                  })),
                ]}
                fullWidth
              />
              <Button
                intent="danger"
                onClick={(e) => {
                  e.preventDefault();
                  removeMappedRawId(index());
                }}
                iconName="trash"
                outline
              />
            </div>
          )}
        </For>
        <div class="">
          <Button
            intent="success"
            onClick={(e) => {
              e.preventDefault();
              addMappedRawId();
            }}
            iconName="plus"
            outline
          />
        </div>
      </div>
    </AlertFormHolder>
  );
}
