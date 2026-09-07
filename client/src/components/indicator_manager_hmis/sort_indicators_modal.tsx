import {
  AlertComponentProps,
  AlertFormHolder,
  SortableList,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { t3, type CommonIndicatorWithMappings } from "lib";
import { serverActions } from "~/server_actions";

// One order for the whole common dictionary (PLAN_1a §1.9): it is what every
// indicator axis in every figure sorts by, so base and derived indicators sort
// together in one list rather than each type having its own.
type Props = AlertComponentProps<
  { commonIndicators: CommonIndicatorWithMappings[] },
  undefined
>;

export function SortIndicatorsModal(p: Props) {
  const [items, setItems] = createSignal(
    [...p.commonIndicators]
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.indicator_common_id.localeCompare(b.indicator_common_id),
      )
      .map((ind) => ({
        id: ind.indicator_common_id,
        label: ind.indicator_common_label,
      })),
  );

  const save = createFormAction(
    async () => {
      const order = items().map((i) => i.id);
      return await serverActions.reorderCommonIndicators({ order });
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="sort-indicators-form"
      header={t3({
        en: "Sort indicators",
        fr: "Trier les indicateurs",
        pt: "Ordenar os indicadores",
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
              <span class="ui-text-caption mr-2 font-mono">{item.id}</span>
              {item.label}
            </div>
          )}
        </SortableList>
      </div>
    </AlertFormHolder>
  );
}
