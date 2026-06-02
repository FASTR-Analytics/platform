import {
  AlertComponentProps,
  AlertFormHolder,
  SortableList,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { t3, type CalculatedIndicator } from "lib";
import { serverActions } from "~/server_actions";

type Props = AlertComponentProps<
  { calculatedIndicators: CalculatedIndicator[] },
  undefined
>;

export function SortCalculatedIndicatorsModal(p: Props) {
  const [items, setItems] = createSignal(
    [...p.calculatedIndicators]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ci) => ({ id: ci.calculated_indicator_id, label: ci.label })),
  );

  const save = timActionForm(
    async () => {
      const order = items().map((i) => i.id);
      const res = await serverActions.reorderCalculatedIndicators({ order });
      if (!res.success) {
        return { success: false, err: res.err };
      }
      return { success: true };
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="sort-calculated-indicators-form"
      header={t3({
        en: "Sort calculated indicators",
        fr: "Trier les indicateurs calculés",
      })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="">
        <SortableList
          items={items()}
          onReorder={(ids) =>
            setItems((prev) => ids.map((id) => prev.find((i) => i.id === id)!))}
        >
          {(item) => (
            <div class="bg-base-200 rounded px-3 py-2">
              <span class="text-neutral mr-2 font-mono text-xs">{item.id}</span>
              {item.label}
            </div>
          )}
        </SortableList>
      </div>
    </AlertFormHolder>
  );
}
