import { t3, type Dhis2Credentials } from "lib";
import { Button, StateHolderFormError, timActionForm } from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2CredentialsEditor } from "~/components/Dhis2CredentialsEditor";
import { getDhis2SessionCredentials, setDhis2SessionCredentials } from "~/state/instance/t4_dhis2_session";
import type { WizardState } from "./index";

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
  const [connected, setConnected] = createSignal(false);

  const connectAction = timActionForm(
    async () => {
      const creds = credentials();
      if (!creds.url || !creds.username || !creds.password) {
        return { success: false, err: t3({ en: "All credential fields are required", fr: "Tous les champs sont requis" }) };
      }

      if (saveCredentialsToSession()) {
        setDhis2SessionCredentials(creds);
      }

      const res = await serverActions.dhis2GetOrgUnitLevels(creds);
      if (res.success) {
        state.setDhis2Credentials(creds);
        state.setDhis2Levels(res.data.levels);
        setConnected(true);
      }
      return res;
    },
    () => {},
  );

  function handleContinue() {
    state.setStep(2);
  }

  return (
    <div class="ui-spy">
      <div class="font-600">{t3({ en: "Step 1: Connect to DHIS2", fr: "Étape 1 : Se connecter à DHIS2" })}</div>

      <Show when={!connected()}>
        <Dhis2CredentialsEditor
          credentials={credentials}
          setCredentials={setCredentials}
          saveToSession={saveCredentialsToSession}
          setSaveToSession={setSaveCredentialsToSession}
        />

        <StateHolderFormError state={connectAction.state()} />
        <div class="ui-gap-sm flex">
          <Button
            onClick={connectAction.click}
            state={connectAction.state()}
            disabled={!credentials().url || !credentials().username || !credentials().password}
            intent="primary"
          >
            {t3({ en: "Connect", fr: "Se connecter" })}
          </Button>
          <Button intent="neutral" onClick={() => state.setStep(0)}>
            {t3({ en: "Back", fr: "Retour" })}
          </Button>
        </div>
      </Show>

      <Show when={connected()}>
        <div class="ui-spy-sm">
          <div class="font-600 text-sm">{t3({ en: "Available DHIS2 levels", fr: "Niveaux DHIS2 disponibles" })}</div>
          <div class="text-base-500 text-sm">
            {t3({ en: "Connected to", fr: "Connecté à" })} {state.dhis2Credentials()?.url}
          </div>
        </div>

        <div class="border-base-300 rounded border">
          <div class="bg-base-100 border-base-300 flex border-b px-3 py-2 text-sm font-semibold">
            <div class="w-1/4">{t3({ en: "Level", fr: "Niveau" })}</div>
            <div class="w-1/2">{t3({ en: "Name", fr: "Nom" })}</div>
            <div class="w-1/4">{t3({ en: "Org units", fr: "Unités" })}</div>
          </div>
          <For each={state.dhis2Levels()}>
            {(level) => (
              <div class="border-base-200 flex items-center border-b px-3 py-2 text-sm last:border-b-0">
                <div class="w-1/4 font-mono">{level.level}</div>
                <div class="w-1/2">{level.name}</div>
                <div class="w-1/4">{level.orgUnitCount}</div>
              </div>
            )}
          </For>
        </div>

        <div class="ui-gap-sm flex">
          <Button onClick={handleContinue} intent="primary">
            {t3({ en: "Continue", fr: "Continuer" })}
          </Button>
          <Button intent="neutral" onClick={() => { setConnected(false); }}>
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
