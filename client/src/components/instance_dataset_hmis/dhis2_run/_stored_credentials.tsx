import { t3, type Dhis2Credentials, type Dhis2StoredCredentialsInfo } from "lib";
import {
  Button,
  StateHolderFormError,
  createDeleteAction,
  createFormAction,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2CredentialsEditor } from "../../Dhis2CredentialsEditor";

type Props = {
  storedCredentials: Dhis2StoredCredentialsInfo | undefined;
  encryptionKeyConfigured: boolean;
  onChanged: () => Promise<void>;
};

// The stored DHIS2 connection (PLAN_DHIS2_IMPORTER Phase 4, C3): the
// credentials scheduled and queued imports run with. The password is
// encrypted at rest and never returned by the server.
export function Dhis2StoredCredentials(p: Props) {
  const [editing, setEditing] = createSignal<boolean>(false);
  const [credentials, setCredentials] = createSignal<Dhis2Credentials>({
    url: p.storedCredentials?.url ?? "",
    username: p.storedCredentials?.username ?? "",
    password: "",
  });

  const save = createFormAction(async () => {
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
    const res = await serverActions.saveDatasetHmisDhis2Credentials({
      credentials: creds,
    });
    if (res.success) {
      setEditing(false);
    }
    return res;
  }, p.onChanged);

  const deleteStored = createDeleteAction(
    t3({
      en: "Delete the stored DHIS2 credentials? Scheduled and queued imports will be refused until new credentials are saved.",
      fr: "Supprimer les identifiants DHIS2 enregistrés ? Les importations planifiées et en file d'attente seront refusées jusqu'à l'enregistrement de nouveaux identifiants.",
      pt: "Eliminar as credenciais DHIS2 guardadas? As importações agendadas e em fila serão recusadas até que novas credenciais sejam guardadas.",
    }),
    () => serverActions.deleteDatasetHmisDhis2Credentials({}),
    p.onChanged,
  );

  return (
    <div class="border-base-300 ui-pad ui-spy rounded border">
      <div class="font-700 text-lg">
        {t3({
          en: "Stored DHIS2 connection",
          fr: "Connexion DHIS2 enregistrée",
          pt: "Ligação DHIS2 guardada",
        })}
      </div>
      <div class="text-sm">
        {t3({
          en: "Scheduled and queued imports run with these credentials. The password is encrypted at rest and only decrypted inside the import worker.",
          fr: "Les importations planifiées et en file d'attente utilisent ces identifiants. Le mot de passe est chiffré au repos et n'est déchiffré que dans le processus d'importation.",
          pt: "As importações agendadas e em fila utilizam estas credenciais. A palavra-passe é cifrada em repouso e só é decifrada no processo de importação.",
        })}
      </div>
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
        <Match when={editing()}>
          <Dhis2CredentialsEditor
            credentials={credentials}
            setCredentials={setCredentials}
          />
          <StateHolderFormError state={save.state()} />
          <div class="ui-gap-sm flex">
            <Button onClick={save.click} intent="success" state={save.state()}>
              {t3({
                en: "Validate and save",
                fr: "Valider et enregistrer",
                pt: "Validar e guardar",
              })}
            </Button>
            <Button onClick={() => setEditing(false)} outline>
              {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
            </Button>
          </div>
        </Match>
        <Match when={p.storedCredentials} keyed>
          {(stored) => (
            <div class="ui-spy-sm">
              <div class="text-sm">
                <span class="font-700">{stored.url}</span> — {stored.username}
              </div>
              <div class="text-xs">
                {t3({ en: "Saved by", fr: "Enregistré par", pt: "Guardado por" })}{" "}
                {stored.updatedBy},{" "}
                {new Date(stored.updatedAt).toLocaleString()}
              </div>
              <div class="ui-gap-sm flex">
                <Button onClick={() => setEditing(true)} outline size="sm">
                  {t3({ en: "Replace", fr: "Remplacer", pt: "Substituir" })}
                </Button>
                <Button
                  onClick={deleteStored.click}
                  intent="danger"
                  outline
                  size="sm"
                >
                  {t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" })}
                </Button>
              </div>
            </div>
          )}
        </Match>
        <Match when={true}>
          <div class="ui-spy-sm">
            <div class="text-sm">
              {t3({
                en: "No credentials stored yet.",
                fr: "Aucun identifiant enregistré pour le moment.",
                pt: "Ainda não há credenciais guardadas.",
              })}
            </div>
            <Show when={!editing()}>
              <Button onClick={() => setEditing(true)} outline size="sm">
                {t3({
                  en: "Save credentials",
                  fr: "Enregistrer des identifiants",
                  pt: "Guardar credenciais",
                })}
              </Button>
            </Show>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
