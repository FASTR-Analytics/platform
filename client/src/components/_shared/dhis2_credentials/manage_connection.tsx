import { t3, type Dhis2Credentials } from "lib";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  StateHolderWrapper,
  createQuery,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2StepCredentials } from "./step_credentials";

type Props = {};

// A standalone entry point onto the credentials editor (PLAN_DHIS2_
// CREDENTIAL_STORE_CONSOLIDATION §5): self-fetching, so any DHIS2 flow can
// open it without threading a stored-credentials query through as a prop.
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
      rightButtons={
        <Button onClick={() => p.close(undefined)} outline>
          {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
        </Button>
      }
    >
      <StateHolderWrapper state={infoQuery.state()} noPad>
        {(info) => {
          const [editing, setEditing] = createSignal<boolean>(!info.storedCredentials);
          const [credentials, setCredentials] = createSignal<Dhis2Credentials>({
            url: info.storedCredentials?.url ?? "",
            username: "",
            password: "",
          });
          return (
            <Dhis2StepCredentials
              storedCredentials={info.storedCredentials}
              encryptionKeyConfigured={info.encryptionKeyConfigured}
              editing={editing}
              setEditing={setEditing}
              credentials={credentials}
              setCredentials={setCredentials}
              onSaved={async () => {
                await infoQuery.silentFetch();
              }}
            />
          );
        }}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
