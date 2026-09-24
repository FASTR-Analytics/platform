import {
  NO_STORED_DHIS2_CONNECTION,
  t3,
  type FacilityFamily,
  type StructureDhis2ConnectionSnapshot,
} from "lib";
import { Button, StateHolderFormError, createFormAction } from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  step1Result: StructureDhis2ConnectionSnapshot | undefined;
  family: FacilityFamily;
  silentFetch: () => Promise<void>;
};

// Structure import is saved-only for DHIS2 (PLAN_DHIS2_CREDENTIAL_STORE_
// CONSOLIDATION Phase 2): step 1 confirms the instance-wide stored
// connection, which is set only in the Data page's DHIS2 connection row.
export function Step1_Dhis2(p: Props) {
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
        <div class="ui-text-heading">
          {t3({ en: "DHIS2 Connection", fr: "Connexion DHIS2", pt: "Ligação DHIS2" })}
        </div>
        <div class="ui-spy rounded border p-4">
          <Show
            when={instanceState.dhis2ConnectionUrl}
            fallback={<div class="text-danger">{t3(NO_STORED_DHIS2_CONNECTION)}</div>}
            keyed
          >
            {(url) => (
              <div class="text-sm">
                {t3({
                  en: "Use stored connection:",
                  fr: "Utiliser la connexion enregistrée :",
                  pt: "Utilizar a ligação guardada:",
                })}{" "}
                <span class="font-700">{url}</span>
              </div>
            )}
          </Show>
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
          disabled={!instanceState.dhis2ConnectionUrl}
          iconName="save"
        >
          {t3({ en: "Confirm and continue", fr: "Confirmer et continuer", pt: "Confirmar e continuar" })}
        </Button>
      </div>
    </div>
  );
}
