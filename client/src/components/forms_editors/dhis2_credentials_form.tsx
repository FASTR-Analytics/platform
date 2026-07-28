import { t3, TC, type Dhis2Credentials } from "lib";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  createFormAction,
  StateHolderFormError,
} from "panther";
import { createStore } from "solid-js/store";
import { Dhis2CredentialsEditor } from "../Dhis2CredentialsEditor";
import { serverActions } from "~/server_actions";

// A one-off, never-persisted DHIS2 connection override (PLAN_DHIS2_
// CREDENTIAL_STORE_CONSOLIDATION Phase 3) — used where a flow defaults to
// the instance's stored connection but needs an inline alternative.
export function Dhis2CredentialsForm(
  p: AlertComponentProps<{}, { credentials: Dhis2Credentials } | undefined>,
) {
  const [tempCredentials, setTempCredentials] = createStore<Dhis2Credentials>({
    url: "",
    username: "",
    password: "",
  });

  const saveAction = createFormAction(async () => {
    if (!tempCredentials.url.trim()) {
      return { success: false, err: t3({ en: "DHIS2 URL is required", fr: "L'URL DHIS2 est requise", pt: "O URL DHIS2 é obrigatório" }) };
    }
    if (!tempCredentials.username.trim()) {
      return { success: false, err: t3({ en: "Username is required", fr: "Le nom d'utilisateur est requis", pt: "O nome de utilizador é obrigatório" }) };
    }
    if (!tempCredentials.password.trim()) {
      return { success: false, err: t3({ en: "Password is required", fr: "Le mot de passe est requis", pt: "A palavra-passe é obrigatória" }) };
    }

    const creds = {
      url: tempCredentials.url.trim(),
      username: tempCredentials.username.trim(),
      password: tempCredentials.password.trim(),
    };

    const testResult = await serverActions.testDhis2IndicatorsConnection({
      credentialsSource: { kind: "inline", credentials: creds },
    });

    if (!testResult.success) {
      return { success: false, err: testResult.err };
    }

    p.close({ credentials: creds });

    return { success: true };
  });

  function handleCancel() {
    p.close(undefined);
  }

  const isValid = () =>
    tempCredentials.url.trim() &&
    tempCredentials.username.trim() &&
    tempCredentials.password.trim();

  return (
    <ModalContainer
      title={t3({ en: "DHIS2 Connection Credentials", fr: "Identifiants de connexion DHIS2", pt: "Credenciais de ligação DHIS2" })}
      width="md"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={saveAction.click}
            intent="primary"
            disabled={!isValid()}
            state={saveAction.state()}
          >
            {t3({ en: "Set Credentials", fr: "Définir les identifiants", pt: "Definir credenciais" })}
          </Button>,
          <Button onClick={handleCancel} intent="neutral" outline>
            {t3(TC.cancel)}
          </Button>,
        ]
      }
    >
      <div class="text-base-content text-sm">
        {t3({
          en: "Enter DHIS2 connection details for this session only — not saved as the instance's stored connection.",
          fr: "Saisissez les informations de connexion DHIS2 pour cette session uniquement — non enregistrées comme connexion de l'instance.",
          pt: "Introduza os dados de ligação DHIS2 apenas para esta sessão — não são guardados como a ligação da instância.",
        })}
      </div>

      <div class="ui-spy-sm">
        <Dhis2CredentialsEditor
          credentials={() => tempCredentials}
          setCredentials={setTempCredentials}
          fullWidth
        />
      </div>

      <StateHolderFormError state={saveAction.state()} />
    </ModalContainer>
  );
}
