import { NO_STORED_DHIS2_CONNECTION, t3 } from "lib";
import { Button, StateHolderFormError, createFormAction } from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import type { WizardState } from "./index";

type Props = {
  state: WizardState;
};

export function Step1Dhis2(p: Props) {
  const { state } = p;

  const [connected, setConnected] = createSignal<boolean>(false);

  const connectAction = createFormAction(
    async () => {
      const connectionUrl = instanceState.dhis2ConnectionUrl;
      if (!connectionUrl) {
        return { success: false, err: t3(NO_STORED_DHIS2_CONNECTION) };
      }
      const res = await serverActions.dhis2GetOrgUnitLevels({});
      if (res.success) {
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
      <div class="font-700">{t3({ en: "Step 1: Connect to DHIS2", fr: "Étape 1 : Se connecter à DHIS2", pt: "Passo 1: Ligar ao DHIS2" })}</div>

      <Show when={!connected()}>
        <Show
          when={instanceState.dhis2ConnectionUrl}
          fallback={<div class="text-danger text-sm">{t3(NO_STORED_DHIS2_CONNECTION)}</div>}
          keyed
        >
          {(url) => (
            <div class="text-sm">
              {t3({ en: "Connection:", fr: "Connexion :", pt: "Ligação:" })}{" "}
              <span class="font-700">{url}</span>
            </div>
          )}
        </Show>

        <StateHolderFormError state={connectAction.state()} />
        <div class="ui-gap-sm flex">
          <Button
            onClick={connectAction.click}
            state={connectAction.state()}
            intent="primary"
            disabled={!instanceState.dhis2ConnectionUrl}
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
          <div class="text-sm">{t3({ en: "Available DHIS2 levels", fr: "Niveaux DHIS2 disponibles", pt: "Níveis DHIS2 disponíveis" })}</div>
          <div class="text-base-content-muted text-sm">
            {t3({ en: "Connected to", fr: "Connecté à", pt: "Ligado a" })} {state.dhis2ConnectionUrl()}
          </div>
        </div>

        <div class="rounded border">
          <div class="bg-base-100 flex border-b px-3 py-2 text-sm font-700">
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
          <Button intent="neutral" onClick={() => state.setStep(0)}>
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        </div>
      </Show>
    </div>
  );
}
