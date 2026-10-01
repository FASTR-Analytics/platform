import { t3 } from "lib";
import {
  AlertComponentProps,
  Button,
  type ListItem,
  ModalContainer,
  TabsNavigation,
} from "panther";
import { createSignal, For, Show } from "solid-js";

export type UnusedVariable = { variableId: string; variableLabel: string };

export type UnusedVariablesByTimePoint = {
  timePoint: string;
  unused: UnusedVariable[];
};

type Props = {
  timePoints: UnusedVariablesByTimePoint[];
};

export function HfaUnusedVariablesModal(
  p: AlertComponentProps<Props, UnusedVariable>,
) {
  const [selected, setSelected] = createSignal<string>(
    p.timePoints[0]?.timePoint ?? "",
  );

  const tabItems = (): ListItem<string>[] =>
    p.timePoints.map((tp) => ({
      id: tp.timePoint,
      label: tp.timePoint,
      badge: tp.unused.length,
    }));

  const activeUnused = () =>
    p.timePoints.find((tp) => tp.timePoint === selected())?.unused ?? [];

  return (
    <ModalContainer
      title={t3({
        en: "Unused variables",
        fr: "Variables inutilisées",
        pt: "Variáveis não utilizadas",
      })}
      width="lg"
      onClose={{ kind: "close", onClick: () => p.close(undefined) }}
    >
      <Show
        when={p.timePoints.length > 0}
        fallback={
          <div class="text-base-content-muted">
            {t3({
              en: "No time points",
              fr: "Aucun point temporel",
              pt: "Nenhum ponto temporal",
            })}
          </div>
        }
      >
        <TabsNavigation
          noPad
          items={tabItems()}
          value={selected()}
          onChange={setSelected}
        />
        <div class="max-h-[50vh] overflow-y-auto pt-4">
          <Show
            when={activeUnused().length > 0}
            fallback={
              <div class="text-base-content-muted">
                {t3({
                  en: "No unused variables for this time point",
                  fr: "Aucune variable inutilisée pour ce point temporel",
                  pt: "Nenhuma variável não utilizada para este ponto temporal",
                })}
              </div>
            }
          >
            <div class="ui-spy-sm">
              <For each={activeUnused()}>
                {(v) => (
                  <div class="ui-gap-sm flex items-center border-b pb-2">
                    <span class="font-mono">{v.variableId}</span>
                    <span class="text-base-content-muted flex-1 truncate">
                      {v.variableLabel}
                    </span>
                    <Button
                      size="sm"
                      outline
                      iconName="plus"
                      onClick={() => p.close(v)}
                    >
                      {t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </ModalContainer>
  );
}
