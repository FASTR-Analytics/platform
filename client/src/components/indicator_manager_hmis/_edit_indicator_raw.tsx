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

export function EditIndicatorRawForm(
  p: AlertComponentProps<
    {
      commonIndicators: CommonIndicatorWithMappings[];
      existingRawIndicator?: RawIndicatorWithMappings;
    },
    undefined
  >,
) {
  const mode = p.existingRawIndicator ? "update" : "create";

  const [indicatorRawId, setIndicatorRawId] = createSignal(
    p.existingRawIndicator?.raw_indicator_id || "",
  );
  const [indicatorLabel, setIndicatorLabel] = createSignal(
    p.existingRawIndicator?.raw_indicator_label || "",
  );
  const [mappedCommonIds, setMappedCommonIds] = createSignal<string[]>(
    p.existingRawIndicator?.indicator_common_ids ?? [],
  );

  function addMappedCommonId() {
    setMappedCommonIds([...mappedCommonIds(), ""]);
  }

  function removeMappedCommonId(index: number) {
    const current = mappedCommonIds();
    setMappedCommonIds(current.filter((_, i) => i !== index));
  }

  function updateMappedCommonId(index: number, value: string) {
    const current = mappedCommonIds();
    const updated = [...current];
    updated[index] = value;
    setMappedCommonIds(updated);
  }

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      const rawId = indicatorRawId().trim();
      const label = indicatorLabel().trim();

      if (mode === "create" && !rawId) {
        return { success: false, err: t3({ en: "Indicator Raw ID is required", fr: "L'identifiant brut de l'indicateur est requis", pt: "O ID bruto do indicador é obrigatório" }) };
      }

      if (mode === "create" && getNewIndicatorIdIssue(rawId)) {
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

      const filteredMappedCommonIds = getUnique(
        mappedCommonIds().filter((id) => id.trim() !== ""),
      );

      if (mode === "create") {
        return await serverActions.createRawIndicators({
          indicators: [
            {
              indicator_raw_id: rawId,
              indicator_raw_label: label,
              mapped_common_ids: filteredMappedCommonIds,
            },
          ],
        });
      } else {
        return await serverActions.updateRawIndicator({
          old_indicator_raw_id: p.existingRawIndicator!.raw_indicator_id,
          new_indicator_raw_id: rawId,
          indicator_raw_label: label,
          mapped_common_ids: filteredMappedCommonIds,
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
          ? t3({ en: "Add DHIS2 Indicator", fr: "Ajouter un indicateur DHIS2", pt: "Adicionar indicador DHIS2" })
          : t3({ en: "Update DHIS2 Indicator", fr: "Mettre à jour l'indicateur DHIS2", pt: "Atualizar indicador DHIS2" })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <Input
        label={t3({ en: "DHIS2 Indicator ID (JSON ID)", fr: "ID de l'indicateur DHIS2 (ID JSON)", pt: "ID do indicador DHIS2 (ID JSON)" })}
        value={indicatorRawId()}
        onChange={setIndicatorRawId}
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
          {t3({ en: "Mapped Common Indicators", fr: "Indicateurs communs associés", pt: "Indicadores comuns associados" })}
        </div>
        <For each={mappedCommonIds()}>
          {(commonId, index) => (
            <div class="ui-gap-sm flex items-center">
              <Select
                value={commonId}
                onChange={(value) => updateMappedCommonId(index(), value)}
                options={[
                  { value: "", label: t3({ en: "Select common indicator...", fr: "Sélectionner un indicateur commun...", pt: "Selecionar um indicador comum..." }) },
                  ...p.commonIndicators.map((common) => ({
                    value: common.indicator_common_id,
                    label: `${common.indicator_common_id} ~ ${getTruncatedString(common.indicator_common_label, 30)}`,
                  })),
                ]}
                fullWidth
              />
              <Button
                intent="danger"
                onClick={(e) => {
                  e.preventDefault();
                  removeMappedCommonId(index());
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
              addMappedCommonId();
            }}
            iconName="plus"
            outline
          />
        </div>
      </div>
    </AlertFormHolder>
  );
}
