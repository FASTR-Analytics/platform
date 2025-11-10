import {
  AlertComponentProps,
  AlertFormHolder,
  TextArea,
  timActionForm,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { isFrench, t, t2, T } from "lib";

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
        return { success: false, err: t("You must enter at least one email") };
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
      header={t2(T.FRENCH_UI_STRINGS.add_new_user)}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <TextArea
        label={t2(T.FRENCH_UI_STRINGS.email)}
        value={tempEmail()}
        onChange={setTempEmail}
        fullWidth
        autoFocus
        height="150px"
      />
      <div class="text-xs">
        {t(
          "Add multiple emails, separated by a comma, semicolon, or line break.",
        )}
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
