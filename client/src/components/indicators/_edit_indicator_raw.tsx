// Form component for create/update
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Input,
  Select,
  getSelectOptions,
  getTruncatedString,
  getUnique,
  timActionForm,
} from "panther";
import { For, createSignal } from "solid-js";
import {
  t3,
  TC,
  type CommonIndicatorWithMappings,
  type RawIndicatorWithMappings,
} from "lib";
import { serverActions } from "~/server_actions";

export function EditIndicatorRawForm(
  p: AlertComponentProps<
    {
      commonIndicators: CommonIndicatorWithMappings[];
      existingRawIndicator?: RawIndicatorWithMappings;
      silentRefreshIndicators: () => Promise<void>;
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

  function addMappedRawId() {
    setMappedCommonIds([...mappedCommonIds(), ""]);
  }

  function removeMappedRawId(index: number) {
    const current = mappedCommonIds();
    setMappedCommonIds(current.filter((_, i) => i !== index));
  }

  function updateMappedRawId(index: number, value: string) {
    const current = mappedCommonIds();
    const updated = [...current];
    updated[index] = value;
    setMappedCommonIds(updated);
  }

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      const rawId = indicatorRawId().trim();
      const label = indicatorLabel().trim();

      if (mode === "create" && !rawId) {
        return { success: false, err: t3({ en: "Indicator Raw ID is required", fr: "L'identifiant brut de l'indicateur est requis" }) };
      }

      if (!label) {
        return { success: false, err: t3({ en: "Indicator label is required", fr: "Le libellé de l'indicateur est requis" }) };
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
    p.silentRefreshIndicators,
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="indicator-form"
      header={
        mode === "create"
          ? t3({ en: "Add DHIS2 Indicator", fr: "Ajouter un indicateur DHIS2" })
          : t3({ en: "Update DHIS2 Indicator", fr: "Mettre à jour l'indicateur DHIS2" })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <Input
        label={t3({ en: "DHIS2 Indicator ID (JSON ID)", fr: "ID de l'indicateur DHIS2 (ID JSON)" })}
        value={indicatorRawId()}
        onChange={setIndicatorRawId}
        fullWidth
        autoFocus
        mono
      />
      <Input
        label={t3(TC.label)}
        value={indicatorLabel()}
        onChange={setIndicatorLabel}
        fullWidth
      />
      <div class="ui-spy-sm">
        <div class="font-700 text-base-content text-sm">
          {t3({ en: "Mapped Common Indicators", fr: "Indicateurs communs associés" })}
        </div>
        <For each={mappedCommonIds()}>
          {(rawId, index) => (
            <div class="ui-gap-sm flex items-center">
              <Select
                value={rawId}
                onChange={(value) => updateMappedRawId(index(), value)}
                options={[
                  { value: "", label: t3({ en: "Select common indicator...", fr: "Sélectionner un indicateur commun..." }) },
                  ...p.commonIndicators.map((raw) => ({
                    value: raw.indicator_common_id,
                    label: `${raw.indicator_common_id} ~ ${getTruncatedString(raw.indicator_common_label, 30)}`,
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
