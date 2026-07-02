import {
  t3,
  type Dhis2Credentials,
  type Dhis2CredentialsRedacted,
  type FacilityFamily,
} from "lib";
import { Button, StateHolderFormError, createFormAction } from "panther";
import { Match, Show, Switch, batch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { setDhis2SessionCredentials } from "~/state/instance/t4_dhis2_session";
import { Dhis2CredentialsEditor } from "../Dhis2CredentialsEditor";

type Props = {
  step1Result: Dhis2CredentialsRedacted | undefined;
  family: FacilityFamily;
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
  const [editingConnection, setEditingConnection] =
    createSignal<boolean>(false);

  const editorVisible = () => !p.step1Result || editingConnection();

  function startEditingConnection() {
    const existing = p.step1Result;
    batch(() => {
      setCredentials({
        url: existing?.url ?? "",
        username: existing?.username ?? "",
        password: "",
      });
      setEditingConnection(true);
    });
  }

  const save = createFormAction(
    async () => {
      const creds = credentials();
      if (!creds.url || !creds.username || !creds.password) {
        return { success: false, err: t3({ en: "All fields are required", fr: "Tous les champs sont requis", pt: "Todos os campos são obrigatórios" }) };
      }

      const res = await serverActions.structureStep1Dhis2_SetCredentials({
        family: p.family,
        url: creds.url,
        username: creds.username,
        password: creds.password,
      });

      if (res.success && saveCredentialsToSession()) {
        setDhis2SessionCredentials(creds);
      }

      return res;
    },
    async () => {
      setEditingConnection(false);
      await p.silentFetch();
    },
  );

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <div class="font-700 text-lg">{t3({ en: "DHIS2 Connection Details", fr: "Détails de connexion DHIS2", pt: "Dados de ligação DHIS2" })}</div>
        <div class="border-base-300 rounded border p-4">
          <div class="ui-spy">
            <div class="">
              {t3({ en: "Enter your DHIS2 connection details to import organization structure.", fr: "Saisissez vos informations de connexion DHIS2 pour importer la structure organisationnelle.", pt: "Introduza os seus dados de ligação DHIS2 para importar a estrutura organizacional." })}
            </div>
            <Switch>
              <Match when={editorVisible()}>
                <Dhis2CredentialsEditor
                  credentials={credentials}
                  setCredentials={setCredentials}
                  saveToSession={saveCredentialsToSession}
                  setSaveToSession={setSaveCredentialsToSession}
                />
                <Show when={p.step1Result}>
                  <div class="text-base-content/70 text-sm">
                    {t3({
                      en: "Saving a new connection will reset the org unit selection and staging steps.",
                      fr: "L'enregistrement d'une nouvelle connexion réinitialisera la sélection des unités organisationnelles et les étapes de préparation.",
                      pt: "Guardar uma nova ligação irá repor a seleção de unidades organizacionais e as etapas de preparação.",
                    })}
                  </div>
                </Show>
              </Match>
              <Match when={p.step1Result} keyed>
                {(step1Result) => (
                  <>
                    <div class="text-success flex items-center gap-2">
                      <span>✓</span>
                      <span>{t3({ en: "DHIS2 connection confirmed", fr: "Connexion DHIS2 confirmée", pt: "Ligação DHIS2 confirmada" })}</span>
                    </div>
                    <div class="text-base-content/70 mt-2 text-sm">
                      {t3({ en: "Connected to", fr: "Connecté à", pt: "Ligado a" })}: {step1Result.url}
                    </div>
                    <div>
                      <Button onClick={startEditingConnection} iconName="pencil">
                        {t3({ en: "Change connection", fr: "Modifier la connexion", pt: "Alterar ligação" })}
                      </Button>
                    </div>
                  </>
                )}
              </Match>
            </Switch>
          </div>
        </div>
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!editorVisible()}
          iconName="save"
        >
          {t3({ en: "Confirm and continue", fr: "Confirmer et continuer", pt: "Confirmar e continuar" })}
        </Button>
        <Show when={p.step1Result && editingConnection()}>
          <Button onClick={() => setEditingConnection(false)} iconName="x">
            {t3({ en: "Cancel", fr: "Annuler" })}
          </Button>
        </Show>
      </div>
    </div>
  );
}
