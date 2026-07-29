import { t3, type RunGenerationAttemptDetail } from "lib";
import {
  Button,
  FrameTop,
  createButtonAction,
  getEditorWrapper,
} from "panther";
import { Match, Switch, createEffect, createSignal } from "solid-js";
import { HeadingBarMainRibbon } from "~/components/_shared/heading_bar_main_ribbon";
import { ResultsPackageWizard } from "~/components/results_package_wizard";
import { serverActions } from "~/server_actions";

// The instance "Results packages" surface (PLAN_RESULTS_RUNS Phase 3 item
// 1): generation is an instance-level act, so this is where the launch
// wizard is entered — one in-flight configuration per admin, resumable. The
// wizard's confirm step chooses which projects the finished package attaches
// to (item 2); a package launched with no targets is attached later from a
// project's Results package tab. The catalogue itself (listing, disk usage,
// guarded delete, live progress, the per-module viewers) is item 3.
export function InstanceResultsPackages() {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [attempt, setAttempt] = createSignal<RunGenerationAttemptDetail | null>(
    null,
  );
  const [version, setVersion] = createSignal(0);

  createEffect(async () => {
    version();
    const res = await serverActions.getRunGenerationAttempt({});
    if (res.success) {
      setAttempt(res.data);
    }
  });

  async function refreshAll(): Promise<void> {
    setVersion((v) => v + 1);
  }

  async function openWizard(): Promise<void> {
    await openEditor({
      element: ResultsPackageWizard,
      props: { silentFetch: refreshAll },
    });
    await refreshAll();
  }

  const startConfiguration = createButtonAction(
    () => serverActions.createRunGenerationAttempt({}),
    refreshAll,
    openWizard,
  );

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBarMainRibbon
            heading={t3({
              en: "Results packages",
              fr: "Paquets de résultats",
              pt: "Pacotes de resultados",
            })}
          >
            <Switch>
              <Match when={attempt() !== null}>
                <Button onClick={openWizard} iconName="pencil">
                  {t3({
                    en: "Resume configuration",
                    fr: "Reprendre la configuration",
                    pt: "Retomar a configuração",
                  })}
                </Button>
              </Match>
              <Match when={true}>
                <Button
                  onClick={startConfiguration.click}
                  state={startConfiguration.state()}
                  iconName="package"
                >
                  {t3({
                    en: "Generate new results package",
                    fr: "Générer un nouveau paquet de résultats",
                    pt: "Gerar novo pacote de resultados",
                  })}
                </Button>
              </Match>
            </Switch>
          </HeadingBarMainRibbon>
        }
      >
        <div class="ui-pad ui-spy">
          <div class="text-base-content-muted max-w-2xl">
            {t3({
              en: "A results package is generated once for the whole instance from the data and modules you choose, then attached to the projects that should use it.",
              fr: "Un paquet de résultats est généré une fois pour toute l'instance à partir des données et des modules que vous choisissez, puis rattaché aux projets qui doivent l'utiliser.",
              pt: "Um pacote de resultados é gerado uma vez para toda a instância a partir dos dados e módulos que escolher, e depois é anexado aos projetos que o devem usar.",
            })}
          </div>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
