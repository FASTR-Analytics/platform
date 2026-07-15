import { t3, type Dhis2Credentials, type Dhis2StoredCredentialsInfo } from "lib";
import {
  Button,
  StateHolderFormError,
  createFormAction,
} from "panther";
import { Match, Show, Switch, createSignal, type Accessor, type Setter } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2CredentialsEditor } from "../../../Dhis2CredentialsEditor";

type Props = {
  storedCredentials: Dhis2StoredCredentialsInfo | undefined;
  encryptionKeyConfigured: boolean;
  editing: Accessor<boolean>;
  setEditing: Setter<boolean>;
  credentials: Accessor<Dhis2Credentials>;
  setCredentials: Setter<Dhis2Credentials>;
  onSaved: () => Promise<void>;
};

// Step 1 body, shared by the wizard and the standalone "Manage connection"
// modal (dhis2_run/_manage_connection.tsx). Overlay rule: this component
// must never call openConfirm/openAlert/openComponent (both hosts can be
// modals themselves) — the delete action below uses createFormAction with
// an inline confirm toggle, never createDeleteAction/createButtonAction
// (both of which call openAlert on error internally).
export function Dhis2StepCredentials(p: Props) {
  const [confirmingDelete, setConfirmingDelete] = createSignal<boolean>(false);

  const save = createFormAction(async () => {
    const creds = p.credentials();
    if (!creds.url || !creds.username || !creds.password) {
      return {
        success: false,
        err: t3({
          en: "All DHIS2 connection fields are required",
          fr: "Tous les champs de connexion DHIS2 sont requis",
          pt: "Todos os campos de ligação DHIS2 são obrigatórios",
        }),
      };
    }
    return await serverActions.saveDatasetHmisDhis2Credentials({
      credentials: creds,
    });
  }, async () => {
    p.setEditing(false);
    await p.onSaved();
  });

  const deleteStored = createFormAction(async () => {
    return await serverActions.deleteDatasetHmisDhis2Credentials({});
  }, async () => {
    setConfirmingDelete(false);
    await p.onSaved();
  });

  return (
    <div class="ui-spy">
      <Switch>
        <Match when={!p.encryptionKeyConfigured}>
          <div class="text-danger text-sm">
            {t3({
              en: "This server has no credentials encryption key (DHIS2_CREDENTIALS_ENCRYPTION_KEY), so credentials cannot be stored and nothing can run unattended. Ask the server administrator to set it.",
              fr: "Ce serveur n'a pas de clé de chiffrement des identifiants (DHIS2_CREDENTIALS_ENCRYPTION_KEY) : les identifiants ne peuvent pas être enregistrés et rien ne peut s'exécuter sans surveillance. Demandez à l'administrateur du serveur de la définir.",
              pt: "Este servidor não tem chave de cifragem de credenciais (DHIS2_CREDENTIALS_ENCRYPTION_KEY), pelo que as credenciais não podem ser guardadas e nada pode ser executado sem supervisão. Peça ao administrador do servidor para a definir.",
            })}
          </div>
        </Match>
        <Match when={!p.editing() && p.storedCredentials} keyed>
          {(stored) => (
            <div class="border-base-300 ui-pad ui-spy-sm rounded border">
              <div class="text-sm">
                {t3({
                  en: "Use stored connection:",
                  fr: "Utiliser la connexion enregistrée :",
                  pt: "Utilizar a ligação guardada:",
                })}{" "}
                <span class="font-700">{stored.url}</span> — {stored.username}
              </div>
              <div class="text-xs">
                {t3({ en: "Saved by", fr: "Enregistré par", pt: "Guardado por" })}{" "}
                {stored.updatedBy}, {new Date(stored.updatedAt).toLocaleString()}
              </div>
              <div class="ui-gap-sm flex items-center">
                <Button onClick={() => p.setEditing(true)} outline size="sm" iconName="pencil">
                  {t3({ en: "Replace", fr: "Remplacer", pt: "Substituir" })}
                </Button>
                <Switch>
                  <Match when={!confirmingDelete()}>
                    <Button
                      onClick={() => setConfirmingDelete(true)}
                      outline
                      intent="danger"
                      size="sm"
                      iconName="trash"
                    >
                      {t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" })}
                    </Button>
                  </Match>
                  <Match when={confirmingDelete()}>
                    <span class="text-sm">
                      {t3({
                        en: "Delete the stored connection?",
                        fr: "Supprimer la connexion enregistrée ?",
                        pt: "Eliminar a ligação guardada?",
                      })}
                    </span>
                    <Button
                      onClick={deleteStored.click}
                      state={deleteStored.state()}
                      intent="danger"
                      size="sm"
                    >
                      {t3({ en: "Confirm delete", fr: "Confirmer la suppression", pt: "Confirmar eliminação" })}
                    </Button>
                    <Button onClick={() => setConfirmingDelete(false)} outline size="sm">
                      {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
                    </Button>
                  </Match>
                </Switch>
              </div>
              <StateHolderFormError state={deleteStored.state()} />
            </div>
          )}
        </Match>
        <Match when={p.editing() || !p.storedCredentials}>
          <Dhis2CredentialsEditor
            credentials={p.credentials}
            setCredentials={p.setCredentials}
            fullWidth
          />
          <StateHolderFormError state={save.state()} />
          <div class="ui-gap-sm flex items-center">
            <Button onClick={save.click} state={save.state()} intent="success">
              {t3({
                en: "Validate and save connection",
                fr: "Valider et enregistrer la connexion",
                pt: "Validar e guardar a ligação",
              })}
            </Button>
            <Show when={p.storedCredentials}>
              <Button onClick={() => p.setEditing(false)} outline>
                {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
              </Button>
            </Show>
          </div>
          <div class="text-xs">
            {t3({
              en: "You can also continue without saving — these credentials will only be used for this run.",
              fr: "Vous pouvez aussi continuer sans enregistrer — ces identifiants ne seront utilisés que pour cette importation.",
              pt: "Também pode continuar sem guardar — estas credenciais serão utilizadas apenas para esta importação.",
            })}
          </div>
        </Match>
      </Switch>
    </div>
  );
}
