import {
  DisaggregationOption,
  PresentationObjectConfig,
  ResultsValueInfoForPresentationObject,
  t3,
  TC,
  TranslatableString,
} from "lib";
import {
  AlertComponentProps,
  Button,
  Input,
  ModalContainer,
  SortableList,
  openComponent,
  openConfirm,
} from "panther";
import { For, Show, createMemo, createSignal } from "solid-js";
import { SetStoreFunction, unwrap } from "solid-js/store";
import {
  getDisplayDisaggregationLabel,
  getDisplayDisaggregationValueLabel,
} from "~/state/instance/_util_disaggregation_label";
import { StyleSection } from "./_style_components";

type Props = {
  resultsValueInfo: ResultsValueInfoForPresentationObject;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  effectiveValueProps: string[];
};

// One row per orderable dimension. A row stays visible whenever a stored
// order exists — even when the dimension's values are unavailable
// (too_many_values / error) or the dimension is no longer displayed — because
// the stored order still applies at render and this row's clear button is the
// only way to remove it (same trap the filters panel guards against).
type OrderRow = {
  disOpt: DisaggregationOption;
  canEdit: boolean;
  hasOrder: boolean;
  note: TranslatableString | undefined;
};

const NOTE_SORTED_BY_VALUE: TranslatableString = {
  en: "Not applied while sorted by value",
  fr: "Non appliqué lorsque trié par valeur",
  pt: "Não aplicado quando ordenado por valor",
};
const NOTE_NO_SLOT: TranslatableString = {
  en: "Not applied — no display position",
  fr: "Non appliqué — pas de position d'affichage",
  pt: "Não aplicado — sem posição de apresentação",
};
const NOTE_TOO_MANY: TranslatableString = {
  en: "Too many values to set a custom order",
  fr: "Trop de valeurs pour définir un ordre personnalisé",
  pt: "Demasiados valores para definir uma ordem personalizada",
};
const NOTE_VALUES_UNAVAILABLE: TranslatableString = {
  en: "Values unavailable — the saved order still applies",
  fr: "Valeurs indisponibles — l'ordre enregistré s'applique toujours",
  pt: "Valores indisponíveis — a ordem guardada ainda se aplica",
};
const NOTE_NOT_DISPLAYED: TranslatableString = {
  en: "Dimension not displayed — the saved order is kept",
  fr: "Dimension non affichée — l'ordre enregistré est conservé",
  pt: "Dimensão não apresentada — a ordem guardada é mantida",
};

export function CustomValueOrderSection(p: Props) {
  const hasStoredOrder = (disOpt: DisaggregationOption): boolean => {
    const entry = p.tempConfig.s.customValueOrder?.find(
      (o) => o.disOpt === disOpt,
    );
    return !!entry && entry.orderedIds.length > 0;
  };

  // Why a saved order would be inert for this dimension right now, or
  // undefined when it applies. Mirrors the precedence rules in
  // get_data_config_from_po.ts: asc/desc value sorting beats the header sort
  // on the chart indicator axis and pie slices; a dim sharing the
  // multi-value-props slot occupies no axis. With duplicate disOpt entries
  // the order applies if ANY occupied axis honors it.
  const getInertNote = (
    disOpt: DisaggregationOption,
  ): TranslatableString | undefined => {
    const entries = p.tempConfig.d.disaggregateBy.filter(
      (d) => d.disOpt === disOpt && d.disDisplayOpt !== "replicant",
    );
    const entryNote = (
      e: (typeof entries)[number],
    ): TranslatableString | undefined => {
      if (
        ((p.tempConfig.d.type === "chart" && e.disDisplayOpt === "indicator") ||
          (p.tempConfig.d.type === "pie" && e.disDisplayOpt === "series")) &&
        p.tempConfig.s.sortIndicatorValues !== "none"
      ) {
        return NOTE_SORTED_BY_VALUE;
      }
      if (
        p.effectiveValueProps.length > 1 &&
        e.disDisplayOpt === p.tempConfig.d.valuesDisDisplayOpt
      ) {
        return NOTE_NO_SLOT;
      }
      return undefined;
    };
    const notes = entries.map(entryNote);
    return notes.length > 0 && notes.every((n) => n !== undefined)
      ? notes[0]
      : undefined;
  };

  const rows = createMemo<OrderRow[]>(() => {
    const result: OrderRow[] = [];
    const seen = new Set<DisaggregationOption>();
    for (const dis of p.tempConfig.d.disaggregateBy) {
      if (dis.disDisplayOpt === "replicant" || seen.has(dis.disOpt)) {
        continue;
      }
      seen.add(dis.disOpt);
      const possibleValues =
        p.resultsValueInfo.disaggregationPossibleValues[dis.disOpt];
      const hasOrder = hasStoredOrder(dis.disOpt);
      if (possibleValues?.status === "ok") {
        if (possibleValues.values.length < 2 && !hasOrder) {
          continue;
        }
        result.push({
          disOpt: dis.disOpt,
          canEdit: possibleValues.values.length > 1,
          hasOrder,
          note: getInertNote(dis.disOpt),
        });
      } else if (possibleValues?.status === "too_many_values") {
        result.push({
          disOpt: dis.disOpt,
          canEdit: false,
          hasOrder,
          note: hasOrder ? NOTE_VALUES_UNAVAILABLE : NOTE_TOO_MANY,
        });
      } else if (hasOrder) {
        result.push({
          disOpt: dis.disOpt,
          canEdit: false,
          hasOrder: true,
          note: NOTE_VALUES_UNAVAILABLE,
        });
      }
    }
    for (const entry of p.tempConfig.s.customValueOrder ?? []) {
      if (seen.has(entry.disOpt) || entry.orderedIds.length === 0) {
        continue;
      }
      seen.add(entry.disOpt);
      result.push({
        disOpt: entry.disOpt,
        canEdit: false,
        hasOrder: true,
        note: NOTE_NOT_DISPLAYED,
      });
    }
    return result;
  });

  const storedOrder = (disOpt: DisaggregationOption): string[] | undefined => {
    const entry = p.tempConfig.s.customValueOrder?.find(
      (o) => o.disOpt === disOpt,
    );
    return entry && entry.orderedIds.length > 0 ? entry.orderedIds : undefined;
  };

  function setOrder(disOpt: DisaggregationOption, orderedIds: string[]) {
    const others = (
      p.tempConfig.s.customValueOrder
        ? unwrap(p.tempConfig.s.customValueOrder)
        : []
    ).filter((o) => o.disOpt !== disOpt);
    p.setTempConfig("s", "customValueOrder", [
      ...structuredClone(others),
      { disOpt, orderedIds },
    ]);
  }

  async function clearOrder(disOpt: DisaggregationOption) {
    const confirmed = await openConfirm({
      title: t3({
        en: "Clear custom order?",
        fr: "Effacer l'ordre personnalisé ?",
        pt: "Limpar a ordem personalizada?",
      }),
      text: t3({
        en: "The saved order for this dimension will be removed.",
        fr: "L'ordre enregistré pour cette dimension sera supprimé.",
        pt: "A ordem guardada para esta dimensão será removida.",
      }),
    });
    if (!confirmed) {
      return;
    }
    const others = (
      p.tempConfig.s.customValueOrder
        ? unwrap(p.tempConfig.s.customValueOrder)
        : []
    ).filter((o) => o.disOpt !== disOpt);
    p.setTempConfig(
      "s",
      "customValueOrder",
      others.length > 0 ? structuredClone(others) : undefined,
    );
  }

  async function editOrder(disOpt: DisaggregationOption) {
    const possibleValues =
      p.resultsValueInfo.disaggregationPossibleValues[disOpt];
    if (possibleValues?.status !== "ok") {
      return;
    }
    const res = await openComponent({
      element: CustomValueOrderModal,
      props: {
        dimLabel: t3(getDisplayDisaggregationLabel(disOpt, p.resultsValueInfo.datasetFamily)),
        items: possibleValues.values.map((v) => ({
          id: v.id,
          label: getDisplayDisaggregationValueLabel(v.id, v.label),
        })),
        startingOrder: storedOrder(disOpt),
      },
    });
    if (res) {
      setOrder(disOpt, res);
    }
  }

  return (
    <Show when={rows().length > 0}>
      <StyleSection
        label={t3({
          en: "Custom value order",
          fr: "Ordre personnalisé des valeurs",
          pt: "Ordem personalizada dos valores",
        })}
      >
        <For each={rows()}>
          {(row) => (
            <div>
              <div class="ui-gap-sm flex items-center">
                <div class="min-w-0 flex-1 truncate">
                  {t3(getDisplayDisaggregationLabel(row.disOpt, p.resultsValueInfo.datasetFamily))}
                </div>
                <Show when={row.canEdit}>
                  <Button
                    onClick={() => editOrder(row.disOpt)}
                    intent="neutral"
                    iconName="selector"
                  >
                    {row.hasOrder
                      ? t3({ en: "Edit order", fr: "Modifier l'ordre", pt: "Editar ordem" })
                      : t3({ en: "Set order", fr: "Définir l'ordre", pt: "Definir ordem" })}
                  </Button>
                </Show>
                <Show when={row.hasOrder}>
                  <Button
                    onClick={() => clearOrder(row.disOpt)}
                    intent="neutral"
                    iconName="x"
                    ariaLabel={t3({
                      en: "Clear custom order",
                      fr: "Effacer l'ordre personnalisé",
                      pt: "Limpar a ordem personalizada",
                    })}
                  />
                </Show>
              </div>
              <Show when={row.note}>
                <div class="text-warning text-xs">{t3(row.note!)}</div>
              </Show>
            </div>
          )}
        </For>
      </StyleSection>
    </Show>
  );
}

const MODAL_SEARCH_THRESHOLD = 20;

function CustomValueOrderModal(
  p: AlertComponentProps<
    {
      dimLabel: string;
      items: { id: string; label: string }[];
      startingOrder: string[] | undefined;
    },
    string[]
  >,
) {
  // Mirrors panther's sortByIdOrder render semantics: ranked ids first,
  // unranked sink to the end alphabetically.
  const rank = new Map((p.startingOrder ?? []).map((id, i) => [id, i]));
  const [items, setItems] = createSignal(
    [...p.items].sort((a, b) => {
      const ai = rank.get(a.id) ?? Number.POSITIVE_INFINITY;
      const bi = rank.get(b.id) ?? Number.POSITIVE_INFINITY;
      if (ai !== bi) {
        return ai - bi;
      }
      return a.label.localeCompare(b.label);
    }),
  );
  const [filter, setFilter] = createSignal("");

  const filteredItems = () => {
    const f = filter().trim().toLowerCase();
    return items().filter((i) => i.label.toLowerCase().includes(f));
  };

  function moveTo(id: string, position: "top" | "bottom") {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id)!;
      const rest = prev.filter((i) => i.id !== id);
      return position === "top" ? [item, ...rest] : [...rest, item];
    });
  }

  return (
    <ModalContainer
      title={p.dimLabel}
      width="md"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={() => p.close(items().map((i) => i.id))}
            intent="success"
            iconName="save"
          >
            {t3(TC.save)}
          </Button>,
          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            iconName="x"
          >
            {t3(TC.cancel)}
          </Button>,
        ]
      }
    >
      <div class="ui-spy-sm">
        <Show when={p.items.length > MODAL_SEARCH_THRESHOLD}>
          <Input
            value={filter()}
            onChange={setFilter}
            placeholder={t3({
              en: "Search values",
              fr: "Rechercher des valeurs",
              pt: "Pesquisar valores",
            })}
            clearable
            fullWidth
          />
        </Show>
        <Show
          when={filter().trim() === ""}
          fallback={
            <div class="ui-spy-sm">
              <For each={filteredItems()}>
                {(item) => (
                  <div class="ui-gap-sm bg-base-200 flex items-center rounded px-3 py-2">
                    <div class="min-w-0 flex-1 truncate">{item.label}</div>
                    <Button
                      onClick={() => moveTo(item.id, "top")}
                      intent="neutral"
                      iconName="arrowUp"
                      ariaLabel={t3({
                        en: "Move to top",
                        fr: "Déplacer en haut",
                        pt: "Mover para o topo",
                      })}
                    />
                    <Button
                      onClick={() => moveTo(item.id, "bottom")}
                      intent="neutral"
                      iconName="arrowDown"
                      ariaLabel={t3({
                        en: "Move to bottom",
                        fr: "Déplacer en bas",
                        pt: "Mover para o fim",
                      })}
                    />
                  </div>
                )}
              </For>
            </div>
          }
        >
          <SortableList
            items={items()}
            onReorder={(ids) =>
              setItems((prev) => ids.map((id) => prev.find((i) => i.id === id)!))}
          >
            {(item) => (
              <div class="bg-base-200 rounded px-3 py-2">{item.label}</div>
            )}
          </SortableList>
        </Show>
      </div>
    </ModalContainer>
  );
}
