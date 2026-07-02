import { Show, createSignal } from "solid-js";
import { t3, type Dhis2Credentials, type Dhis2CredentialsRedacted } from "lib";
import { serverActions } from "~/server_actions";
import { Button, StateHolderFormError, createFormAction } from "panther";
import { Dhis2CredentialsEditor } from "../Dhis2CredentialsEditor";
import { setDhis2SessionCredentials } from "~/state/instance/t4_dhis2_session";

type Props = {
  step1Result: Dhis2CredentialsRedacted | undefined;
  silentFetch: () => Promise<void>;
};

export function Step1_Dhis2(p: Props) {
  const [credentials, setCredentials] = createSignal<Dhis2Credentials>({
    url: "",
    username: "",
    password: "",
  });
  const [saveCredentialsToSession, setSaveCredentialsToSession] =
    createSignal<boolean>(false);
  const [editing, setEditing] = createSignal<boolean>(!p.step1Result);

  const save = createFormAction(async () => {
    const creds = credentials();
    if (!creds.url || !creds.username || !creds.password) {
      return { success: false, err: t3({ en: "All fields are required", fr: "Tous les champs sont requis", pt: "Todos os campos são obrigatórios" }) };
    }

    const res = await serverActions.dhis2ConfirmCredentials({
      url: creds.url,
      username: creds.username,
      password: creds.password,
    });

    if (res.success && saveCredentialsToSession()) {
      setDhis2SessionCredentials(creds);
    }

    return res;
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <div class="font-700 text-lg">{t3({ en: "DHIS2 Import Configuration", fr: "Configuration de l'importation DHIS2", pt: "Configuração da importação DHIS2" })}</div>
        <div class="border-base-300 rounded border p-4">
          <div class="ui-spy">
            <div class="">
              {t3({ en: "Enter your DHIS2 connection details to import data.", fr: "Saisissez vos informations de connexion DHIS2 pour importer les données.", pt: "Introduza os seus dados de ligação DHIS2 para importar os dados." })}
            </div>
            <Show when={editing()}>
              <Dhis2CredentialsEditor
                credentials={credentials}
                setCredentials={setCredentials}
                saveToSession={saveCredentialsToSession}
                setSaveToSession={setSaveCredentialsToSession}
              />
            </Show>
            <Show when={!editing()}>
              <div class="text-success flex items-center gap-2">
                <span>✓</span>
                <span>{t3({ en: "DHIS2 connection confirmed", fr: "Connexion DHIS2 confirmée", pt: "Ligação DHIS2 confirmada" })}</span>
              </div>
              <div class="text-base-content/70 mt-2 text-sm">
                {t3({ en: "Connected to", fr: "Connecté à", pt: "Ligado a" })}: {p.step1Result?.url}
              </div>
              <Button onClick={() => setEditing(true)} iconName="pencil">
                {t3({ en: "Change connection", fr: "Modifier la connexion" })}
              </Button>
            </Show>
          </div>
        </div>
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!editing()}
          iconName="save"
        >
          {t3({ en: "Confirm and continue", fr: "Confirmer et continuer", pt: "Confirmar e continuar" })}
        </Button>
      </div>
    </div>
  );
}
