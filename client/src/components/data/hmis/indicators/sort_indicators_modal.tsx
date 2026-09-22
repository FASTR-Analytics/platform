import {
  AlertComponentProps,
  ModalContainer,
  SortableList,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { t3, type HmisIndicator } from "lib";
import { serverActions } from "~/server_actions";

// One order for the whole dictionary (PLAN_1a §1.9): it is what every
// indicator axis in every figure sorts by, so counts and calculated indicators
// sort together in one list rather than each type having its own.
type Props = AlertComponentProps<
  { indicators: HmisIndicator[] },
  undefined
>;

export function SortIndicatorsModal(p: Props) {
  const [items, setItems] = createSignal(
    [...p.indicators]
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
      return await serverActions.reorderIndicators({ order });
    },
    () => p.close(undefined),
  );

  return (
    <ModalContainer
      title={t3({
        en: "Sort indicators",
        fr: "Trier les indicateurs",
        pt: "Ordenar os indicadores",
      })}
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" }),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div>
        <SortableList
          items={items()}
          onReorder={(ids) =>
            setItems((prev) => ids.map((id) => prev.find((i) => i.id === id)!))}
        >
          {(item) => (
            <div class="bg-base-200 ui-pad-sm rounded">
              <span class="ui-text-caption mr-2 font-mono">{item.id}</span>
              {item.label}
            </div>
          )}
        </SortableList>
      </div>
    </ModalContainer>
  );
}
