import { t3 } from "lib";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  TabsNavigation,
  type ListItem,
} from "panther";
import { For, Show, createSignal } from "solid-js";

export type UnusedVariablesByTimePoint = {
  timePoint: string;
  unused: { varName: string; varLabel: string }[];
};

type Props = {
  timePoints: UnusedVariablesByTimePoint[];
};

export function HfaUnusedVariablesModal(
  p: AlertComponentProps<Props, undefined>,
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
      title={t3({ en: "Unused variables", fr: "Variables inutilisées", pt: "Variáveis não utilizadas" })}
      width="lg"
      leftButtons={[
        // eslint-disable-next-line jsx-key
        <Button onClick={() => p.close(undefined)} intent="neutral" iconName="x">
          {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
        </Button>,
      ]}
    >
      <Show
        when={p.timePoints.length > 0}
        fallback={
          <div class="text-neutral">
            {t3({ en: "No time points", fr: "Aucun point temporel", pt: "Nenhum ponto temporal" })}
          </div>
        }
      >
        <TabsNavigation items={tabItems()} value={selected()} onChange={setSelected} />
        <div class="max-h-[50vh] overflow-y-auto pt-4">
          <Show
            when={activeUnused().length > 0}
            fallback={
              <div class="text-neutral">
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
                  <div class="border-base-300 ui-gap-sm flex items-baseline border-b pb-2">
                    <span class="font-mono">{v.varName}</span>
                    <Show when={v.varLabel}>
                      <span class="text-neutral flex-1 truncate">{v.varLabel}</span>
                    </Show>
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
