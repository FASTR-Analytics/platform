import { t3, type Dhis2Credentials } from "lib";
import { Button, StateHolderFormError, timActionForm } from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2CredentialsEditor } from "~/components/Dhis2CredentialsEditor";
import { getDhis2SessionCredentials, setDhis2SessionCredentials } from "~/state/instance/t4_dhis2_session";
import type { WizardState, DetectedMapping } from "./index";

type Props = {
  state: WizardState;
};

export function Step1Dhis2(p: Props) {
  const { state } = p;

  const sessionCreds = getDhis2SessionCredentials();
  const [credentials, setCredentials] = createSignal<Dhis2Credentials>(
    sessionCreds ?? { url: "", username: "", password: "" }
  );
  const [saveCredentialsToSession, setSaveCredentialsToSession] = createSignal(false);
  const [detectedMappings, setDetectedMappings] = createSignal<DetectedMapping[]>([]);
  const [detected, setDetected] = createSignal(false);

  const detectAction = timActionForm(
    async () => {
      const creds = credentials();
      if (!creds.url || !creds.username || !creds.password) {
        return { success: false, err: t3({ en: "All credential fields are required", fr: "Tous les champs sont requis" }) };
      }

      if (saveCredentialsToSession()) {
        setDhis2SessionCredentials(creds);
      }

      const res = await serverActions.dhis2DetectLevelMapping(creds);
      if (res.success) {
        setDetectedMappings(res.data.mappings);
        setDetected(true);
        state.setDhis2Credentials(creds);
      }
      return res;
    },
    () => {},
  );

  function handleContinue() {
    const mappings = detectedMappings().filter((m) => m.dhis2Level !== null && m.confidence !== "none");
    if (mappings.length === 0) {
      return;
    }
    state.setDetectedMappings(mappings);
    state.setStep(2);
  }

  function getConfidenceBadge(confidence: string) {
    switch (confidence) {
      case "high":
        return <span class="badge badge-success badge-sm">{t3({ en: "High match", fr: "Correspondance élevée" })}</span>;
      case "medium":
        return <span class="badge badge-warning badge-sm">{t3({ en: "Partial match", fr: "Correspondance partielle" })}</span>;
      case "low":
        return <span class="badge badge-error badge-sm">{t3({ en: "Low match", fr: "Faible correspondance" })}</span>;
      default:
        return <span class="badge badge-ghost badge-sm">{t3({ en: "No match", fr: "Pas de correspondance" })}</span>;
    }
  }

  const hasValidMappings = () => detectedMappings().some((m) => m.dhis2Level !== null && m.confidence !== "none");

  return (
    <div class="ui-spy">
      <div class="font-600">{t3({ en: "Step 1: Connect to DHIS2", fr: "Étape 1 : Se connecter à DHIS2" })}</div>

      <Show when={!detected()}>
        <Dhis2CredentialsEditor
          credentials={credentials}
          setCredentials={setCredentials}
          saveToSession={saveCredentialsToSession}
          setSaveToSession={setSaveCredentialsToSession}
        />

        <StateHolderFormError state={detectAction.state()} />
        <div class="ui-gap-sm flex">
          <Button
            onClick={detectAction.click}
            state={detectAction.state()}
            disabled={!credentials().url || !credentials().username || !credentials().password}
            intent="primary"
          >
            {t3({ en: "Connect & detect levels", fr: "Se connecter et détecter les niveaux" })}
          </Button>
          <Button intent="neutral" onClick={() => state.setStep(0)}>
            {t3({ en: "Back", fr: "Retour" })}
          </Button>
        </div>
      </Show>

      <Show when={detected()}>
        <div class="ui-spy-sm">
          <div class="font-600 text-sm">{t3({ en: "Detected level mappings", fr: "Correspondances de niveaux détectées" })}</div>
          <div class="text-base-500 text-sm">
            {t3({ en: "Based on admin area counts and geometry availability:", fr: "Sur la base du nombre de zones administratives et de la disponibilité des géométries :" })}
          </div>
        </div>

        <div class="border-base-300 rounded border">
          <div class="bg-base-100 border-base-300 flex border-b px-3 py-2 text-sm font-semibold">
            <div class="w-1/5">{t3({ en: "Admin Level", fr: "Niveau admin" })}</div>
            <div class="w-1/5">{t3({ en: "Count", fr: "Nombre" })}</div>
            <div class="w-2/5">{t3({ en: "DHIS2 Level", fr: "Niveau DHIS2" })}</div>
            <div class="w-1/5">{t3({ en: "Match", fr: "Correspondance" })}</div>
          </div>
          <For each={detectedMappings()}>
            {(mapping) => (
              <div class="border-base-200 flex items-center border-b px-3 py-2 text-sm last:border-b-0">
                <div class="w-1/5 font-mono">AA{mapping.adminAreaLevel}</div>
                <div class="w-1/5">{mapping.adminAreaCount}</div>
                <div class="w-2/5">
                  <Show when={mapping.dhis2Level !== null} fallback={
                    <span class="text-error">{t3({ en: "No geometry available", fr: "Aucune géométrie disponible" })}</span>
                  }>
                    {mapping.dhis2LevelName} ({mapping.geometryCount} {t3({ en: "with geometry", fr: "avec géométrie" })})
                  </Show>
                </div>
                <div class="w-1/5">{getConfidenceBadge(mapping.confidence)}</div>
              </div>
            )}
          </For>
        </div>

        <Show when={!hasValidMappings()}>
          <div class="text-warning text-sm">
            {t3({ en: "No DHIS2 levels with geometry found that match your admin areas. Boundaries may need to be uploaded manually.", fr: "Aucun niveau DHIS2 avec géométrie trouvé correspondant à vos zones administratives. Les limites devront peut-être être téléchargées manuellement." })}
          </div>
        </Show>

        <div class="ui-gap-sm flex">
          <Button
            onClick={handleContinue}
            disabled={!hasValidMappings()}
            intent="primary"
          >
            {t3({ en: "Continue with detected mappings", fr: "Continuer avec les correspondances détectées" })}
          </Button>
          <Button intent="neutral" onClick={() => { setDetected(false); setDetectedMappings([]); }}>
            {t3({ en: "Change credentials", fr: "Modifier les identifiants" })}
          </Button>
          <Button intent="neutral" onClick={() => state.setStep(0)}>
            {t3({ en: "Back", fr: "Retour" })}
          </Button>
        </div>
      </Show>
    </div>
  );
}
