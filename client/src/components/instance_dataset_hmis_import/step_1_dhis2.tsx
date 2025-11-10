import { Show, createSignal } from "solid-js";
import { t, type Dhis2Credentials } from "lib";
import { serverActions } from "~/server_actions";
import { Button, StateHolderFormError, timActionForm } from "panther";
import { Dhis2CredentialsEditor } from "../Dhis2CredentialsEditor";
import { setDhis2SessionCredentials } from "~/state/dhis2-session-storage";

type Props = {
  step1Result: Dhis2Credentials | undefined;
  silentFetch: () => Promise<void>;
};

export function Step1_Dhis2(p: Props) {
  const [credentials, setCredentials] = createSignal<Dhis2Credentials>({
    url: p.step1Result?.url ?? "",
    username: p.step1Result?.username ?? "",
    password: p.step1Result?.password ?? "",
  });
  const [saveCredentialsToSession, setSaveCredentialsToSession] =
    createSignal<boolean>(false);
  const [needsSaving] = createSignal<boolean>(!p.step1Result);

  const save = timActionForm(async () => {
    const creds = credentials();
    if (!creds.url || !creds.username || !creds.password) {
      return { success: false, err: t("All fields are required") };
    }

    if (saveCredentialsToSession()) {
      setDhis2SessionCredentials(creds);
    }

    return serverActions.dhis2ConfirmCredentials({
      url: creds.url,
      username: creds.username,
      password: creds.password,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <div class="font-700 text-lg">{t("DHIS2 Import Configuration")}</div>
        <div class="border-base-300 rounded border p-4">
          <div class="ui-spy">
            <div class="">
              {t("Enter your DHIS2 connection details to import data.")}
            </div>
            <Show when={!p.step1Result}>
              <Dhis2CredentialsEditor
                credentials={credentials}
                setCredentials={setCredentials}
                saveToSession={saveCredentialsToSession}
                setSaveToSession={setSaveCredentialsToSession}
              />
            </Show>
            <Show when={p.step1Result}>
              <div class="text-success flex items-center gap-2">
                <span>✓</span>
                <span>{t("DHIS2 connection confirmed")}</span>
              </div>
              <div class="text-base-content/70 mt-2 text-sm">
                {t("Connected to")}: {p.step1Result?.url}
              </div>
            </Show>
          </div>
        </div>
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving()}
          iconName="save"
        >
          {t("Confirm and continue")}
        </Button>
      </div>
    </div>
  );
}
