import {
  AlertComponentProps,
  AlertFormHolder,
  TextArea,
  timActionForm,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { isFrench, t3, TC } from "lib";

export function AddUserForm(
  p: AlertComponentProps<{ silentFetch: () => Promise<void> }, undefined>,
) {
  // Temp state

  const [tempEmail, setTempEmail] = createSignal<string>("");

  const goodEmailList = () =>
    tempEmail()
      .replaceAll(",", ":::")
      .replaceAll(";", ":::")
      .replaceAll("\n", ":::")
      .split(":::")
      .map((str) => str.trim())
      .filter(Boolean);

  // Actions

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const goodEmails = goodEmailList().map((str) => str.toLowerCase());
      if (goodEmails.length === 0) {
        return { success: false, err: t3({ en: "You must enter at least one email", fr: "Vous devez saisir au moins un e-mail" }) };
      }
      return serverActions.addUsers({
        emails: goodEmails,
        isGlobalAdmin: false,
      });
    },
    p.silentFetch,
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="add-user"
      header={t3({ en: "Add new user", fr: "Ajouter un utilisateur" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <TextArea
        label={t3(TC.email)}
        value={tempEmail()}
        onChange={setTempEmail}
        fullWidth
        autoFocus
        height="150px"
      />
      <div class="text-xs">
        {t3({ en: "Add multiple emails, separated by a comma, semicolon, or line break.", fr: "Ajouter plusieurs e-mails (séparés par virgule, point-virgule ou saut de ligne)" })}
      </div>
      <Show when={goodEmailList().length > 0}>
        <div class="">
          <For each={goodEmailList()}>
            {(email) => {
              return <div class="list-item list-inside text-xs">{email}</div>;
            }}
          </For>
        </div>
      </Show>
    </AlertFormHolder>
  );
}
