import { t3, TC, type IcehIndicator } from "lib";
import {
  Button,
  Checkbox,
  EditorComponentProps,
  FrameTop,
  Input,
  MultiSelect,
  type SelectOption,
  createDeleteAction,
} from "panther";
import { createSignal, onMount, Show } from "solid-js";
import { serverActions } from "~/server_actions";

export function DeleteData(
  p: EditorComponentProps<
    {
      silentFetch: () => Promise<void>;
    },
    undefined
  >
) {
  const [deleteAll, setDeleteAll] = createSignal(true);
  const [checkText, setCheckText] = createSignal("");
  const [indicators, setIndicators] = createSignal<IcehIndicator[]>([]);
  const [selectedCodes, setSelectedCodes] = createSignal<string[]>([]);

  onMount(async () => {
    const res = await serverActions.getDatasetIcehDisplayData({});
    if (res.success) {
      setIndicators(res.data.indicators);
    }
  });

  const options = (): SelectOption<string>[] =>
    indicators().map((i) => ({
      value: i.indicatorCode,
      label: `${i.indicatorName} (${i.indicatorCode})`,
    }));

  async function attemptDeleteAll() {
    const deleteAction = createDeleteAction(
      t3({
        en: "Are you very sure you want to delete all ICEH data?",
        fr: "Êtes-vous sûr de vouloir supprimer toutes les données ICEH ?",
        pt: "Tem mesmo a certeza de que pretende eliminar todos os dados ICEH?",
      }),
      () => serverActions.deleteDatasetIcehData({}),
      async () => {
        await p.silentFetch();
        p.close(undefined);
      }
    );
    await deleteAction.click();
  }

  async function attemptDeleteSelected() {
    const codes = selectedCodes();
    const deleteAction = createDeleteAction(
      t3({
        en: `Delete the ${codes.length} selected indicator(s)? Other indicators are kept.`,
        fr: `Supprimer les ${codes.length} indicateur(s) sélectionné(s) ? Les autres indicateurs sont conservés.`,
        pt: `Eliminar o(s) ${codes.length} indicador(es) selecionado(s)? Os outros indicadores são conservados.`,
      }),
      () => serverActions.deleteDatasetIcehIndicators({ indicatorCodes: codes }),
      async () => {
        await p.silentFetch();
        p.close(undefined);
      }
    );
    await deleteAction.click();
  }

  const canDeleteAll = () => checkText() === "yes please delete";

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">{t3(TC.delete)}</div>
        </div>
      }
    >
      <div class="ui-pad ui-spy h-full w-full">
        <Checkbox
          label={t3({
            en: "Delete ALL ICEH data",
            fr: "Supprimer TOUTES les données ICEH",
            pt: "Eliminar TODOS os dados ICEH",
          })}
          checked={deleteAll()}
          onChange={setDeleteAll}
        />

        <Show
          when={deleteAll()}
          fallback={
            <div class="ui-spy">
              <div class="">
                {t3({
                  en: "Select the indicators to delete. All other indicators are kept.",
                  fr: "Sélectionnez les indicateurs à supprimer. Tous les autres indicateurs sont conservés.",
                  pt: "Selecione os indicadores a eliminar. Todos os outros indicadores são conservados.",
                })}
              </div>
              <div class="w-96">
                <MultiSelect
                  values={selectedCodes()}
                  options={options()}
                  onChange={setSelectedCodes}
                  label={t3({ en: "Indicators", fr: "Indicateurs", pt: "Indicadores" })}
                />
              </div>
              <div class="">
                <Button
                  intent="danger"
                  iconName="trash"
                  disabled={selectedCodes().length === 0}
                  onClick={attemptDeleteSelected}
                >
                  {t3(TC.delete)}
                </Button>
              </div>
            </div>
          }
        >
          <div class="ui-spy">
            <div class="">
              {t3({ en: "If you want to delete", fr: "Pour supprimer", pt: "Para eliminar" })}{" "}
              {t3({ en: "all the ICEH data", fr: "toutes les données ICEH", pt: "todos os dados ICEH" })},{" "}
              {t3({ en: "write", fr: "écrivez", pt: "escreva" })}{" "}
              <span class="font-700">yes please delete</span>{" "}
              {t3({ en: "in the input box", fr: "dans le champ de saisie", pt: "no campo de introdução" })}
            </div>
            <div class="w-96">
              <Input value={checkText()} onChange={setCheckText} />
            </div>
            <div class="">
              <Button
                intent="danger"
                iconName="trash"
                disabled={!canDeleteAll()}
                onClick={attemptDeleteAll}
              >
                {t3(TC.delete)}
              </Button>
            </div>
          </div>
        </Show>
      </div>
    </FrameTop>
  );
}
