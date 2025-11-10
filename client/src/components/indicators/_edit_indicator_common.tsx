// Form component for create/update
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Input,
  Select,
  getTruncatedString,
  getUnique,
  timActionForm,
} from "panther";
import { For, createSignal } from "solid-js";
import {
  t,
  type CommonIndicatorWithMappings,
  type RawIndicatorWithMappings,
} from "lib";
import { serverActions } from "~/server_actions";

export function EditIndicatorCommonForm(
  p: AlertComponentProps<
    {
      rawIndicators: RawIndicatorWithMappings[];
      existingCommonIndicator?: CommonIndicatorWithMappings;
      silentRefreshIndicators: () => Promise<void>;
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

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      const commonId = indicatorCommonId().trim();
      const label = indicatorLabel().trim();

      if (mode === "create" && !commonId) {
        return { success: false, err: t("Indicator ID is required") };
      }

      if (!label) {
        return { success: false, err: t("Indicator label is required") };
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
    p.silentRefreshIndicators,
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="indicator-form"
      header={
        mode === "create"
          ? t("Add Common Indicator")
          : t("Update Common Indicator")
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <Input
        label={t("Common ID")}
        value={indicatorCommonId()}
        onChange={setIndicatorCommonId}
        fullWidth
        autoFocus
        mono
        disabled={!!p.existingCommonIndicator?.is_default}
      />
      <Input
        label={t("Label")}
        value={indicatorLabel()}
        onChange={setIndicatorLabel}
        fullWidth
      />
      <div class="ui-spy-sm">
        <div class="font-700 text-base-content text-sm">
          {t("Mapped DHIS2 Indicators (JSON IDs)")}
        </div>
        <For each={mappedRawIds()}>
          {(rawId, index) => (
            <div class="ui-gap-sm flex items-center">
              <Select
                value={rawId}
                onChange={(value) => updateMappedRawId(index(), value)}
                options={[
                  { value: "", label: t("Select DHIS2 indicator...") },
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
