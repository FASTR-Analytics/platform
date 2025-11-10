import { t, type Dhis2Credentials } from "lib";
import { Checkbox, Input } from "panther";
import type { Accessor, Setter } from "solid-js";
import { Show, createSignal, onMount } from "solid-js";
import { getDhis2SessionCredentials } from "~/state/dhis2-session-storage";

type Props = {
  credentials: Accessor<Dhis2Credentials>;
  setCredentials: Setter<Dhis2Credentials>;
  saveToSession?: Accessor<boolean>;
  setSaveToSession?: Setter<boolean>;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function Dhis2CredentialsEditor(p: Props) {
  const [showSaveOption, setShowSaveOption] = createSignal<boolean>(false);

  onMount(() => {
    // Check if credentials are empty and load from session if available
    const current = p.credentials();
    const isEmpty = !current.url && !current.username && !current.password;

    if (isEmpty) {
      const sessionCredentials = getDhis2SessionCredentials();
      if (sessionCredentials) {
        p.setCredentials(sessionCredentials);
      } else {
        setShowSaveOption(true);
      }
    }
  });

  // Save to session when appropriate
  const handleCredentialChange = (
    field: keyof Dhis2Credentials,
    value: string,
  ) => {
    setShowSaveOption(true);
    p.setCredentials((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div
      class="ui-spy w-96 data-[fullWidth=true]:w-full"
      data-fullWidth={!!p.fullWidth}
    >
      <Input
        label={t("DHIS2 URL")}
        value={p.credentials().url}
        onChange={(v) => handleCredentialChange("url", v)}
        placeholder="https://example.dhis2.org"
        fullWidth
        disabled={p.disabled}
      />
      <Input
        label={t("DHIS2 Username")}
        type="password"
        value={p.credentials().username}
        onChange={(v) => handleCredentialChange("username", v)}
        placeholder="username"
        fullWidth
        disabled={p.disabled}
      />
      <Input
        label={t("DHIS2 Password")}
        type="password"
        value={p.credentials().password}
        onChange={(v) => handleCredentialChange("password", v)}
        placeholder="password"
        fullWidth
        disabled={p.disabled}
      />

      <Show when={showSaveOption() && p.saveToSession && p.setSaveToSession}>
        <div class="mt-4">
          <Checkbox
            checked={!!p.saveToSession?.()}
            onChange={(v) => p.setSaveToSession?.(v)}
            label={t("Save credentials for this session")}
            disabled={p.disabled}
          />
        </div>
      </Show>
    </div>
  );
}
