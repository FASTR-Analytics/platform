import { t, t2, T, type Dhis2Credentials } from "lib";
import {
  AlertComponentProps,
  Button,
  timActionForm,
  StateHolderFormError,
} from "panther";
import { createStore } from "solid-js/store";
import { Show, createSignal } from "solid-js";
import { Dhis2CredentialsEditor } from "../Dhis2CredentialsEditor";

export function Dhis2CredentialsForm(
  p: AlertComponentProps<
    {
      existingCredentials?: Dhis2Credentials;
      allowClear?: boolean;
      showSaveCheckbox?: boolean;
    },
    | {
        credentials?: Dhis2Credentials;
        shouldSave?: boolean;
        shouldClear?: boolean;
      }
    | undefined
  >,
) {
  const [tempCredentials, setTempCredentials] = createStore<Dhis2Credentials>({
    url: p.existingCredentials?.url ?? "",
    username: p.existingCredentials?.username ?? "",
    password: p.existingCredentials?.password ?? "",
  });

  const [saveToSession, setSaveToSession] = createSignal<boolean>(false);

  const saveAction = timActionForm(async () => {
    // Validate required fields
    if (!tempCredentials.url.trim()) {
      return { success: false, err: t("DHIS2 URL is required") };
    }
    if (!tempCredentials.username.trim()) {
      return { success: false, err: t("Username is required") };
    }
    if (!tempCredentials.password.trim()) {
      return { success: false, err: t("Password is required") };
    }

    // Add 300ms delay for loading effect
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Return the credentials
    p.close({
      credentials: {
        url: tempCredentials.url.trim(),
        username: tempCredentials.username.trim(),
        password: tempCredentials.password.trim(),
      },
      shouldSave: !p.showSaveCheckbox || saveToSession(),
    });

    return { success: true };
  });

  function handleClear() {
    p.close({ shouldClear: true });
  }

  function handleCancel() {
    p.close(undefined);
  }

  const isValid = () =>
    tempCredentials.url.trim() &&
    tempCredentials.username.trim() &&
    tempCredentials.password.trim();

  return (
    <div class="ui-pad ui-spy-sm min-w-[500px] max-w-[600px]">
      <h2 class="font-700 mb-4 text-lg">{t("DHIS2 Connection Credentials")}</h2>

      <div class="text-base-content mb-6 text-sm">
        {t(
          "Enter your DHIS2 instance credentials. These will be stored only for this session.",
        )}
      </div>

      <div class="ui-spy-sm">
        <Dhis2CredentialsEditor
          credentials={() => tempCredentials}
          setCredentials={setTempCredentials}
          saveToSession={p.showSaveCheckbox ? saveToSession : undefined}
          setSaveToSession={p.showSaveCheckbox ? setSaveToSession : undefined}
          fullWidth
        />
      </div>

      <StateHolderFormError state={saveAction.state()} />

      <div class="ui-gap mt-6 flex justify-between">
        <div class="ui-gap flex">
          <Button
            onClick={saveAction.click}
            intent="primary"
            disabled={!isValid()}
            state={saveAction.state()}
          >
            {t("Set Credentials")}
          </Button>
          <Button onClick={handleCancel} intent="neutral" outline>
            {t2(T.FRENCH_UI_STRINGS.cancel)}
          </Button>
        </div>
        <Show when={p.allowClear}>
          <Button onClick={handleClear} intent="danger" outline>
            {t("Clear Credentials")}
          </Button>
        </Show>
      </div>
    </div>
  );
}
