import { t3, type Dhis2Credentials } from "lib";
import { Button, Input } from "panther";
import type { Accessor, Setter } from "solid-js";
import { createSignal } from "solid-js";

type Props = {
  credentials: Accessor<Dhis2Credentials>;
  setCredentials: Setter<Dhis2Credentials>;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function Dhis2CredentialsEditor(p: Props) {
  const [showCredentials, setShowCredentials] = createSignal<boolean>(false);

  const handleCredentialChange = (
    field: keyof Dhis2Credentials,
    value: string,
  ) => {
    p.setCredentials((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div
      class="ui-spy w-96 data-[fullWidth=true]:w-full"
      data-fullWidth={!!p.fullWidth}
    >
      <Input
        label={t3({ en: "DHIS2 URL", fr: "URL DHIS2", pt: "URL DHIS2" })}
        value={p.credentials().url}
        onChange={(v) => handleCredentialChange("url", v)}
        placeholder="https://example.dhis2.org"
        fullWidth
        disabled={p.disabled}
      />
      <Input
        label={t3({ en: "DHIS2 Username", fr: "Nom d'utilisateur DHIS2", pt: "Nome de utilizador DHIS2" })}
        type={showCredentials() ? "text" : "password"}
        value={p.credentials().username}
        onChange={(v) => handleCredentialChange("username", v)}
        placeholder="username"
        fullWidth
        disabled={p.disabled}
      />
      <Input
        label={t3({ en: "DHIS2 Password", fr: "Mot de passe DHIS2", pt: "Palavra-passe DHIS2" })}
        type={showCredentials() ? "text" : "password"}
        value={p.credentials().password}
        onChange={(v) => handleCredentialChange("password", v)}
        placeholder="password"
        fullWidth
        disabled={p.disabled}
      />
      <Button
        onClick={() => setShowCredentials((v) => !v)}
        iconName={showCredentials() ? "eyeOff" : "eye"}
        intent="neutral"
        outline
        size="sm"
      >
        {showCredentials()
          ? t3({ en: "Hide credentials", fr: "Masquer les identifiants", pt: "Ocultar credenciais" })
          : t3({ en: "Show credentials", fr: "Afficher les identifiants", pt: "Mostrar credenciais" })}
      </Button>
    </div>
  );
}
