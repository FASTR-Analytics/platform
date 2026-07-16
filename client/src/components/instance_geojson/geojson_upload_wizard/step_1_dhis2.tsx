import { t3, type Dhis2Credentials, type Dhis2RunCredentialsSource } from "lib";
import {
  Button,
  StateHolderFormError,
  StateHolderWrapper,
  createFormAction,
  createQuery,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2CredentialsEditor } from "~/components/Dhis2CredentialsEditor";
import type { WizardState } from "./index";

type Props = {
  state: WizardState;
};

// Defaults to the instance's stored DHIS2 connection when one exists
// (PLAN_DHIS2_CREDENTIAL_STORE_CONSOLIDATION Phase 3); the inline editor is a
// one-off override, never persisted.
export function Step1Dhis2(p: Props) {
  const { state } = p;

  const infoQuery = createQuery(
    () => serverActions.getInstanceDhis2CredentialsInfo({}),
    t3({
      en: "Loading DHIS2 connection...",
      fr: "Chargement de la connexion DHIS2...",
      pt: "A carregar a ligação DHIS2...",
    }),
  );

  const [useInline, setUseInline] = createSignal<boolean>(false);
  const [inlineCredentials, setInlineCredentials] = createSignal<Dhis2Credentials>({
    url: "",
    username: "",
    password: "",
  });
  const [connected, setConnected] = createSignal<boolean>(false);

  function hasStored(): boolean {
    const s = infoQuery.state();
    return s.status === "ready" && !!s.data.storedCredentials;
  }

  const connectAction = createFormAction(
    async () => {
      let credentialsSource: Dhis2RunCredentialsSource;
      let connectionUrl: string;
      if (useInline() || !hasStored()) {
        const creds = inlineCredentials();
        if (!creds.url || !creds.username || !creds.password) {
          return {
            success: false,
            err: t3({
              en: "All credential fields are required",
              fr: "Tous les champs sont requis",
              pt: "Todos os campos de credenciais são obrigatórios",
            }),
          };
        }
        credentialsSource = { kind: "inline", credentials: creds };
        connectionUrl = creds.url;
      } else {
        credentialsSource = { kind: "stored" };
        const s = infoQuery.state();
        connectionUrl = (s.status === "ready" && s.data.storedCredentials?.url) || "";
      }

      const res = await serverActions.dhis2GetOrgUnitLevels({ credentialsSource });
      if (res.success) {
        state.setDhis2CredentialsSource(credentialsSource);
        state.setDhis2ConnectionUrl(connectionUrl);
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
      <div class="font-600">{t3({ en: "Step 1: Connect to DHIS2", fr: "Étape 1 : Se connecter à DHIS2", pt: "Passo 1: Ligar ao DHIS2" })}</div>

      <Show when={!connected()}>
        <StateHolderWrapper state={infoQuery.state()} noPad>
          {(info) => (
            <Switch>
              <Match when={!useInline() && info.storedCredentials} keyed>
                {(stored) => (
                  <div class="border-base-300 ui-pad ui-spy-sm rounded border">
                    <div class="text-sm">
                      {t3({
                        en: "Use stored connection:",
                        fr: "Utiliser la connexion enregistrée :",
                        pt: "Utilizar a ligação guardada:",
                      })}{" "}
                      <span class="font-700">{stored.url}</span>
                    </div>
                    <Button onClick={() => setUseInline(true)} outline size="sm" iconName="pencil">
                      {t3({
                        en: "Use a different connection",
                        fr: "Utiliser une autre connexion",
                        pt: "Utilizar uma ligação diferente",
                      })}
                    </Button>
                  </div>
                )}
              </Match>
              <Match when={useInline() || !info.storedCredentials}>
                <Dhis2CredentialsEditor
                  credentials={inlineCredentials}
                  setCredentials={setInlineCredentials}
                />
                <Show when={info.storedCredentials}>
                  <Button onClick={() => setUseInline(false)} outline size="sm">
                    {t3({
                      en: "Use stored connection instead",
                      fr: "Utiliser la connexion enregistrée à la place",
                      pt: "Utilizar a ligação guardada em vez disso",
                    })}
                  </Button>
                </Show>
              </Match>
            </Switch>
          )}
        </StateHolderWrapper>

        <StateHolderFormError state={connectAction.state()} />
        <div class="ui-gap-sm flex">
          <Button
            onClick={connectAction.click}
            state={connectAction.state()}
            intent="primary"
          >
            {t3({ en: "Connect", fr: "Se connecter", pt: "Ligar" })}
          </Button>
          <Button intent="neutral" onClick={() => state.setStep(0)}>
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        </div>
      </Show>

      <Show when={connected()}>
        <div class="ui-spy-sm">
          <div class="font-600 text-sm">{t3({ en: "Available DHIS2 levels", fr: "Niveaux DHIS2 disponibles", pt: "Níveis DHIS2 disponíveis" })}</div>
          <div class="text-base-500 text-sm">
            {t3({ en: "Connected to", fr: "Connecté à", pt: "Ligado a" })} {state.dhis2ConnectionUrl()}
          </div>
        </div>

        <div class="border-base-300 rounded border">
          <div class="bg-base-100 border-base-300 flex border-b px-3 py-2 text-sm font-semibold">
            <div class="w-1/4">{t3({ en: "Level", fr: "Niveau", pt: "Nível" })}</div>
            <div class="w-1/2">{t3({ en: "Name", fr: "Nom", pt: "Nome" })}</div>
            <div class="w-1/4">{t3({ en: "Org units", fr: "Unités", pt: "Unidades" })}</div>
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
            {t3({ en: "Continue", fr: "Continuer", pt: "Continuar" })}
          </Button>
          <Button intent="neutral" onClick={() => { setConnected(false); }}>
            {t3({ en: "Change connection", fr: "Modifier la connexion", pt: "Alterar a ligação" })}
          </Button>
          <Button intent="neutral" onClick={() => state.setStep(0)}>
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        </div>
      </Show>
    </div>
  );
}
