import { type HfaTimePoint, t3, TC } from "lib";
import {
  Button,
  createDeleteAction,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Input,
  RadioGroup,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";

// Time points are option values by index, so no label can collide with "all".
type DeleteTarget = "all" | `${number}`;

export function DeleteData(
  p: EditorComponentProps<
    {
      timePoints: HfaTimePoint[];
    },
    undefined
  >,
) {
  const [checkText, setCheckText] = createSignal("");
  const [target, setTarget] = createSignal<DeleteTarget | undefined>(
    undefined,
  );

  const timePoint = () => {
    const t = target();
    return t === undefined || t === "all"
      ? undefined
      : p.timePoints[Number(t)].label;
  };

  const targetText = () => {
    const tp = timePoint();
    return tp === undefined
      ? t3({
        en: "all the data",
        fr: "toutes les données",
        pt: "todos os dados",
      })
      : t3({
        en: `data for time point "${tp}"`,
        fr: `les données du point temporel « ${tp} »`,
        pt: `os dados do ponto temporal "${tp}"`,
      });
  };

  async function attemptDeleteData() {
    const tp = timePoint();
    const deleteAction = createDeleteAction(
      tp
        ? t3({
          en:
            `Are you very sure you want to delete all data for time point "${tp}"?`,
          fr:
            `Voulez-vous vraiment supprimer toutes les données du point temporel « ${tp} » ?`,
          pt:
            `Tem a certeza de que quer eliminar todos os dados do ponto temporal "${tp}"?`,
        })
        : t3({
          en: "Are you very sure you want to delete all of your data?",
          fr: "Voulez-vous vraiment supprimer toutes vos données ?",
          pt: "Tem a certeza de que quer eliminar todos os seus dados?",
        }),
      () => serverActions.deleteDatasetHfaData({ timePoint: tp }),
      () => p.close(undefined),
    );

    await deleteAction.click();
  }

  return (
    <FrameTop
      pad="md"
      spy="md"
      panelChildren={
        <HeadingBar
          tonal
          onBack={() => p.close(undefined)}
          heading={t3(TC.delete)}
        />
      }
    >
      <RadioGroup<DeleteTarget>
        label={t3({
          en: "Data to delete",
          fr: "Données à supprimer",
          pt: "Dados a eliminar",
        })}
        options={[
          {
            value: "all",
            label: t3({
              en: "All time points",
              fr: "Tous les points temporels",
              pt: "Todos os pontos temporais",
            }),
          },
          ...p.timePoints.map((tp, i) => ({
            value: `${i}` as const,
            label: `${tp.label} (${tp.periodId.slice(0, 4)}-${
              tp.periodId.slice(4, 6)
            })`,
          })),
        ]}
        value={target()}
        onChange={setTarget}
        convertToSelectThreshold={6}
        placeholderForSelect={t3({
          en: "Choose…",
          fr: "Choisir…",
          pt: "Escolher…",
        })}
      />

      <div class="text-base-content-muted text-sm">
        {t3({
          en:
            "Time points, sampling weights, and indicator code are kept. Manage time points on the HFA time points page.",
          fr:
            "Les points temporels, les pondérations d'échantillonnage et le code des indicateurs sont conservés. Gérez les points temporels sur la page des points temporels Enquêtes FOSA.",
          pt:
            "Os pontos temporais, as ponderações de amostragem e o código dos indicadores são mantidos. Faça a gestão dos pontos temporais na página de pontos temporais HFA.",
        })}
      </div>

      <Show when={target() !== undefined}>
        <div>
          {t3({
            en: `If you want to delete ${targetText()}, write`,
            fr: `Pour supprimer ${targetText()}, écrivez`,
            pt: `Para eliminar ${targetText()}, escreva`,
          })} <span class="font-700">{t3(TC.deleteConfirmPhrase)}</span> {t3({
            en: "in the input box",
            fr: "dans le champ de saisie",
            pt: "no campo de introdução",
          })}
        </div>
        <div class="w-96">
          <Input value={checkText()} onChange={setCheckText} />
        </div>
        <div>
          <Button
            intent="danger"
            iconName="trash"
            disabled={checkText() !== t3(TC.deleteConfirmPhrase)}
            onClick={attemptDeleteData}
          >
            {t3(TC.delete)}
          </Button>
        </div>
      </Show>
    </FrameTop>
  );
}
