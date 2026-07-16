import { t3, type FacilityFamily, type StructureDhis2ConnectionSnapshot } from "lib";
import {
  Button,
  StateHolderFormError,
  StateHolderWrapper,
  createFormAction,
  createQuery,
  openComponent,
} from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2ManageConnection } from "../_shared/dhis2_credentials/manage_connection";

type Props = {
  step1Result: StructureDhis2ConnectionSnapshot | undefined;
  family: FacilityFamily;
  silentFetch: () => Promise<void>;
};

// Structure import is saved-only for DHIS2 (PLAN_DHIS2_CREDENTIAL_STORE_
// CONSOLIDATION Phase 2): no credential editor here — the instance-wide
// stored connection is confirmed in place, or replaced via the shared
// manage-connection modal.
export function Step1_Dhis2(p: Props) {
  const infoQuery = createQuery(
    () => serverActions.getInstanceDhis2CredentialsInfo({}),
    t3({
      en: "Loading DHIS2 connection...",
      fr: "Chargement de la connexion DHIS2...",
      pt: "A carregar a ligação DHIS2...",
    }),
  );

  async function openManageConnection() {
    await openComponent({ element: Dhis2ManageConnection, props: {} });
    await infoQuery.silentFetch();
  }

  function hasStoredCredentials(): boolean {
    const s = infoQuery.state();
    return s.status === "ready" && !!s.data.storedCredentials;
  }

  const confirm = createFormAction(
    async () =>
      await serverActions.structureStep1Dhis2_ConfirmConnection({
        family: p.family,
      }),
    async () => {
      await p.silentFetch();
    },
  );

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <div class="font-700 text-lg">
          {t3({ en: "DHIS2 Connection", fr: "Connexion DHIS2", pt: "Ligação DHIS2" })}
        </div>
        <div class="border-base-300 ui-spy rounded border p-4">
          <StateHolderWrapper state={infoQuery.state()} noPad>
            {(info) => (
              <div class="ui-spy-sm">
                <Show
                  when={info.storedCredentials}
                  fallback={
                    <div class="text-danger">
                      {t3({
                        en: "No DHIS2 connection stored for this instance.",
                        fr: "Aucune connexion DHIS2 enregistrée pour cette instance.",
                        pt: "Nenhuma ligação DHIS2 guardada para esta instância.",
                      })}
                    </div>
                  }
                  keyed
                >
                  {(stored) => (
                    <div class="text-sm">
                      {t3({
                        en: "Use stored connection:",
                        fr: "Utiliser la connexion enregistrée :",
                        pt: "Utilizar a ligação guardada:",
                      })}{" "}
                      <span class="font-700">{stored.url}</span>
                    </div>
                  )}
                </Show>
                <div>
                  <Button onClick={openManageConnection} outline iconName="settings">
                    {t3({
                      en: "Manage DHIS2 connection",
                      fr: "Gérer la connexion DHIS2",
                      pt: "Gerir a ligação DHIS2",
                    })}
                  </Button>
                </div>
              </div>
            )}
          </StateHolderWrapper>
          <Show when={p.step1Result} keyed>
            {(step1Result) => (
              <div class="text-success flex items-center gap-2">
                <span>✓</span>
                <span>
                  {t3({
                    en: "DHIS2 connection confirmed:",
                    fr: "Connexion DHIS2 confirmée :",
                    pt: "Ligação DHIS2 confirmada:",
                  })}{" "}
                  {step1Result.url}
                </span>
              </div>
            )}
          </Show>
        </div>
      </div>
      <StateHolderFormError state={confirm.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={confirm.click}
          intent="success"
          state={confirm.state()}
          disabled={!hasStoredCredentials()}
          iconName="save"
        >
          {t3({ en: "Confirm and continue", fr: "Confirmer et continuer", pt: "Confirmar e continuar" })}
        </Button>
      </div>
    </div>
  );
}
