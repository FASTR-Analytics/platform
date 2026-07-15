import { t3, type Dhis2Credentials, type Dhis2ImportSchedulingInfo } from "lib";
import { AlertComponentProps, Button, ModalContainer, Query } from "panther";
import { createSignal } from "solid-js";
import { Dhis2StepCredentials } from "./_wizard/_step_credentials";

type Props = {
  schedulingQuery: Query<Dhis2ImportSchedulingInfo>;
};

// A standalone entry point onto the wizard's step-1 body (§3): rotating the
// stored connection shouldn't require stepping through the whole wizard.
// Same overlay-safe body component, no Next/steps — just Close.
export function Dhis2ManageConnection(p: AlertComponentProps<Props, undefined>) {
  function schedulingData(): Dhis2ImportSchedulingInfo | undefined {
    const s = p.schedulingQuery.state();
    return s.status === "ready" ? s.data : undefined;
  }

  const [editing, setEditing] = createSignal<boolean>(!schedulingData()?.storedCredentials);
  const [credentials, setCredentials] = createSignal<Dhis2Credentials>({
    url: schedulingData()?.storedCredentials?.url ?? "",
    username: "",
    password: "",
  });

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
      <Dhis2StepCredentials
        storedCredentials={schedulingData()?.storedCredentials}
        encryptionKeyConfigured={schedulingData()?.encryptionKeyConfigured ?? true}
        editing={editing}
        setEditing={setEditing}
        credentials={credentials}
        setCredentials={setCredentials}
        onSaved={async () => {
          await p.schedulingQuery.silentFetch();
        }}
      />
    </ModalContainer>
  );
}
