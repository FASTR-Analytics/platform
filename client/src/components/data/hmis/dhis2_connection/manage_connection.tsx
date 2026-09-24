import {
  t3,
  type Dhis2Credentials,
  type InstanceDhis2CredentialsInfo,
} from "lib";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  StateHolderFormError,
  StateHolderWrapper,
  createFormAction,
  createQuery,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2CredentialsEditor } from "./dhis2_credentials_editor";

type Props = {};

// The one place a DHIS2 connection is set, replaced or deleted, opened only
// from the Data page's DHIS2 connection card. Every DHIS2 flow uses the
// stored connection.
export function Dhis2ManageConnection(p: AlertComponentProps<Props, undefined>) {
  const infoQuery = createQuery(
    () => serverActions.getInstanceDhis2CredentialsInfo({}),
    t3({
      en: "Loading DHIS2 connection...",
      fr: "Chargement de la connexion DHIS2...",
      pt: "A carregar a ligação DHIS2...",
    }),
  );

  return (
    <ModalContainer
      width="md"
      title={t3({
        en: "Manage DHIS2 connection",
        fr: "Gérer la connexion DHIS2",
        pt: "Gerir a ligação DHIS2",
      })}
      onClose={{ kind: "close", onClick: () => p.close(undefined) }}
    >
      <StateHolderWrapper state={infoQuery.state()} noPad>
        {(info) => (
          <ConnectionEditor
            info={info}
            onSaved={async () => {
              await infoQuery.silentFetch();
            }}
          />
        )}
      </StateHolderWrapper>
    </ModalContainer>
  );
}

// Overlay rule: this must never call openConfirm/openAlert/openComponent
// (it renders inside a modal): the delete action uses createFormAction with
// an inline confirm toggle, never createDeleteAction/createButtonAction
// (both of which call openAlert on error internally).
function ConnectionEditor(p: {
  info: InstanceDhis2CredentialsInfo;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = createSignal<boolean>(!p.info.storedCredentials);
  const [credentials, setCredentials] = createSignal<Dhis2Credentials>({
    url: p.info.storedCredentials?.url ?? "",
    username: "",
    password: "",
  });
  const [confirmingDelete, setConfirmingDelete] = createSignal<boolean>(false);

  const save = createFormAction(
    async () => {
      const creds = credentials();
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
      return await serverActions.saveInstanceDhis2Credentials({
        credentials: creds,
      });
    },
    async () => {
      setEditing(false);
      await p.onSaved();
    },
  );

  const deleteStored = createFormAction(
    async () => {
      return await serverActions.deleteInstanceDhis2Credentials({});
    },
    async () => {
      setConfirmingDelete(false);
      await p.onSaved();
    },
  );

  return (
    <div class="ui-spy">
      <Switch>
        <Match when={!p.info.encryptionKeyConfigured}>
          <div class="text-danger text-sm">
            {t3({
              en: "This server has no credentials encryption key (DHIS2_CREDENTIALS_ENCRYPTION_KEY), so credentials cannot be stored and nothing can run unattended. Ask the server administrator to set it.",
              fr: "Ce serveur n'a pas de clé de chiffrement des identifiants (DHIS2_CREDENTIALS_ENCRYPTION_KEY) : les identifiants ne peuvent pas être enregistrés et rien ne peut s'exécuter sans surveillance. Demandez à l'administrateur du serveur de la définir.",
              pt: "Este servidor não tem chave de cifragem de credenciais (DHIS2_CREDENTIALS_ENCRYPTION_KEY), pelo que as credenciais não podem ser guardadas e nada pode ser executado sem supervisão. Peça ao administrador do servidor para a definir.",
            })}
          </div>
        </Match>
        <Match when={!editing() && p.info.storedCredentials} keyed>
          {(stored) => (
            <div class="ui-pad ui-spy-sm rounded border">
              <div class="text-sm">
                {t3({
                  en: "Use stored connection:",
                  fr: "Utiliser la connexion enregistrée :",
                  pt: "Utilizar a ligação guardada:",
                })}{" "}
                <span class="font-700">{stored.url}</span>
              </div>
              <div class="text-xs">
                {t3({
                  en: "Saved by",
                  fr: "Enregistré par",
                  pt: "Guardado por",
                })}{" "}
                {stored.updatedBy},{" "}
                {new Date(stored.updatedAt).toLocaleString()}
              </div>
              <div class="ui-gap-sm flex items-center">
                <Button
                  onClick={() => setEditing(true)}
                  outline
                  size="sm"
                  iconName="pencil"
                >
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
                      {t3({
                        en: "Confirm delete",
                        fr: "Confirmer la suppression",
                        pt: "Confirmar eliminação",
                      })}
                    </Button>
                    <Button
                      onClick={() => setConfirmingDelete(false)}
                      outline
                      size="sm"
                    >
                      {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
                    </Button>
                  </Match>
                </Switch>
              </div>
              <StateHolderFormError state={deleteStored.state()} />
            </div>
          )}
        </Match>
        <Match when={editing() || !p.info.storedCredentials}>
          <Dhis2CredentialsEditor
            credentials={credentials}
            setCredentials={setCredentials}
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
            <Show when={p.info.storedCredentials}>
              <Button onClick={() => setEditing(false)} outline>
                {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
              </Button>
            </Show>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
