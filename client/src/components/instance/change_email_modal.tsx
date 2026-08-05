import { t3 } from "lib";
import type { RenameEmailInstanceResult } from "lib";
import {
  type AlertComponentProps,
  Button,
  ModalContainer,
  TextArea,
  createButtonAction,
} from "panther";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { clerk } from "~/components/LoggedInWrapper";
import { openClerkUserProfile } from "./profile";
import { serverActions } from "~/server_actions";

// Self-service email change, everywhere at once. Three steps:
//   1. enter  — type the new address; a dry run previews which instances the
//               account exists on (fleet discovery, nothing changes).
//   2. clerk  — the user adds + verifies the new address and makes it primary
//               through Clerk's own account window (that is what proves they
//               own the mailbox); the modal polls Clerk until all three are
//               done, then refreshes the session token so the JWT already
//               carries the new email before anything is renamed.
//   3. report — the rename runs (this instance in-process, every other
//               instance fleet-internally) and the per-instance outcome is
//               shown. Retry is safe: every step is idempotent. Finishing
//               removes the old address from Clerk and reloads the app, since
//               the SPA's identity state is stale after a self-rename.

type ClerkStatus = { added: boolean; verified: boolean; primary: boolean };

const CLERK_POLL_MS = 3_000;

export function ChangeEmailModal(
  p: AlertComponentProps<{ currentEmail: string }, undefined>,
) {
  const [phase, setPhase] = createSignal<"enter" | "clerk" | "report">("enter");
  const [newEmail, setNewEmail] = createSignal("");
  const [preview, setPreview] = createSignal<RenameEmailInstanceResult[]>([]);
  const [report, setReport] = createSignal<
    { instances: RenameEmailInstanceResult[]; warnings: string[] } | null
  >(null);
  const [clerkStatus, setClerkStatus] = createSignal<ClerkStatus>({
    added: false,
    verified: false,
    primary: false,
  });

  const oldEmail = p.currentEmail.toLowerCase();
  const cleanNewEmail = () => newEmail().trim().toLowerCase();
  const clerkReady = () => {
    const s = clerkStatus();
    return s.added && s.verified && s.primary;
  };

  async function refreshClerkStatus() {
    await clerk.user?.reload();
    const address = clerk.user?.emailAddresses.find(
      (a) => a.emailAddress.toLowerCase() === cleanNewEmail(),
    );
    setClerkStatus({
      added: !!address,
      verified: address?.verification?.status === "verified",
      primary: !!address && clerk.user?.primaryEmailAddressId === address.id,
    });
  }

  createEffect(() => {
    if (phase() !== "clerk") {
      return;
    }
    refreshClerkStatus();
    const timer = setInterval(refreshClerkStatus, CLERK_POLL_MS);
    onCleanup(() => clearInterval(timer));
  });

  const check = createButtonAction(async () => {
    const res = await serverActions.renameUserEmailEverywhere({
      oldEmail,
      newEmail: cleanNewEmail(),
      dryRun: true,
    });
    if (!res.success) {
      return res;
    }
    setPreview(res.data.instances);
    setPhase("clerk");
    return { success: true };
  });

  const execute = createButtonAction(async () => {
    // The JWT must already carry the new email when the local rename lands,
    // so the session stays valid throughout.
    await clerk.session?.getToken({ skipCache: true });
    const res = await serverActions.renameUserEmailEverywhere({
      oldEmail,
      newEmail: cleanNewEmail(),
      dryRun: false,
    });
    if (!res.success) {
      return res;
    }
    setReport(res.data);
    setPhase("report");
    return { success: true };
  });

  const finish = createButtonAction(
    async () => {
      const old = clerk.user?.emailAddresses.find(
        (a) => a.emailAddress.toLowerCase() === oldEmail,
      );
      // Best-effort: a failure here just leaves the old address on the Clerk
      // account, removable later in account settings.
      await old?.destroy().catch(() => {});
      return { success: true };
    },
    () => window.location.reload(),
  );

  const statusLabel = (status: RenameEmailInstanceResult["status"]) => {
    switch (status) {
      case "pending":
        return { text: t3({ en: "Will be renamed", fr: "Sera renommé", pt: "Será renomeado" }), class: "text-base-content" };
      case "updated":
        return { text: t3({ en: "Renamed", fr: "Renommé", pt: "Renomeado" }), class: "text-success" };
      case "conflict":
        return { text: t3({ en: "Conflict — the new email is already in use", fr: "Conflit — le nouvel e-mail est déjà utilisé", pt: "Conflito — o novo e-mail já está em utilização" }), class: "text-danger" };
      case "failed":
        return { text: t3({ en: "Failed", fr: "Échec", pt: "Falhou" }), class: "text-danger" };
      case "unreachable":
        return { text: t3({ en: "Unreachable", fr: "Injoignable", pt: "Inacessível" }), class: "text-warning" };
    }
  };

  const InstanceList = (listProps: { items: RenameEmailInstanceResult[] }) => (
    <div class="flex flex-col gap-1">
      <For each={listProps.items}>
        {(instance) => {
          const label = statusLabel(instance.status);
          return (
            <div class="flex items-baseline gap-2 text-sm">
              <span class="font-700">{instance.id}</span>
              <span class={label.class}>{label.text}</span>
              <Show when={instance.error && instance.status === "failed"}>
                <span class="text-base-content-muted text-xs">{instance.error}</span>
              </Show>
              <Show when={(instance.projectsFailed?.length ?? 0) > 0}>
                <span class="text-warning text-xs">
                  {t3({ en: "some project history not yet updated — retry", fr: "certains historiques de projet pas encore mis à jour — réessayer", pt: "alguns históricos de projeto ainda não atualizados — tentar novamente" })}
                </span>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );

  const CheckItem = (itemProps: { done: boolean; label: string }) => (
    <div class="flex items-center gap-2 text-sm">
      <span class={itemProps.done ? "text-success" : "text-base-content-muted"}>
        {itemProps.done ? "✓" : "○"}
      </span>
      <span>{itemProps.label}</span>
    </div>
  );

  return (
    <ModalContainer
      title={t3({ en: "Change email", fr: "Changer d'e-mail", pt: "Alterar e-mail" })}
      width="lg"
      leftButtons={[
        <Button onClick={() => p.close(undefined)} outline iconName="x">
          {phase() === "report"
            ? t3({ en: "Close without reloading", fr: "Fermer sans recharger", pt: "Fechar sem recarregar" })
            : t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
        </Button>,
      ]}
    >
      <Show when={phase() === "enter"}>
        <div class="flex flex-col gap-4">
          <div class="text-sm">
            {t3({
              en: "This changes your email on every FASTR instance you have access to, keeping all your permissions and history. Do this while you can still receive email at the new address.",
              fr: "Ceci change votre e-mail sur toutes les instances FASTR auxquelles vous avez accès, en conservant vos permissions et votre historique. Faites-le tant que vous pouvez recevoir des e-mails à la nouvelle adresse.",
              pt: "Isto altera o seu e-mail em todas as instâncias FASTR a que tem acesso, mantendo as suas permissões e o seu histórico. Faça-o enquanto puder receber e-mails no novo endereço.",
            })}
          </div>
          <div class="text-base-content-muted text-sm">
            {t3({ en: "Current address", fr: "Adresse actuelle", pt: "Endereço atual" })}: {oldEmail}
          </div>
          <TextArea
            label={t3({ en: "New email address", fr: "Nouvelle adresse e-mail", pt: "Novo endereço de e-mail" })}
            value={newEmail()}
            onChange={setNewEmail}
            fullWidth
            rows={1}
            autoFocus
          />
          <div>
            <Button
              onClick={check.click}
              state={check.state()}
              intent="primary"
              disabled={cleanNewEmail().length === 0}
            >
              {t3({ en: "Check", fr: "Vérifier", pt: "Verificar" })}
            </Button>
          </div>
        </div>
      </Show>

      <Show when={phase() === "clerk"}>
        <div class="flex flex-col gap-4">
          <div class="text-sm">
            {t3({ en: "Your account was found on these instances:", fr: "Votre compte a été trouvé sur ces instances :", pt: "A sua conta foi encontrada nestas instâncias:" })}
          </div>
          <InstanceList items={preview()} />
          <div class="border-t pt-4 text-sm">
            {t3({
              en: "Before renaming, add the new address to your account, verify it with the code sent to it, and set it as your primary address:",
              fr: "Avant le renommage, ajoutez la nouvelle adresse à votre compte, vérifiez-la avec le code envoyé, puis définissez-la comme adresse principale :",
              pt: "Antes de renomear, adicione o novo endereço à sua conta, verifique-o com o código enviado e defina-o como endereço principal:",
            })}
          </div>
          <div class="flex flex-col gap-1">
            <CheckItem
              done={clerkStatus().added}
              label={t3({ en: "New address added to your account", fr: "Nouvelle adresse ajoutée à votre compte", pt: "Novo endereço adicionado à sua conta" })}
            />
            <CheckItem
              done={clerkStatus().verified}
              label={t3({ en: "Address verified", fr: "Adresse vérifiée", pt: "Endereço verificado" })}
            />
            <CheckItem
              done={clerkStatus().primary}
              label={t3({ en: "Set as primary address", fr: "Définie comme adresse principale", pt: "Definido como endereço principal" })}
            />
          </div>
          <div class="flex gap-2">
            <Button onClick={() => openClerkUserProfile()} outline>
              {t3({ en: "Open account settings", fr: "Ouvrir les paramètres du compte", pt: "Abrir as definições da conta" })}
            </Button>
            <Button
              onClick={execute.click}
              state={execute.state()}
              intent="danger"
              disabled={!clerkReady()}
            >
              {t3({ en: "Rename everywhere", fr: "Renommer partout", pt: "Renomear em todo o lado" })}
            </Button>
          </div>
          <Show when={!clerkReady()}>
            <div class="text-base-content-muted text-xs">
              {t3({
                en: "The checklist updates automatically once each step is done in account settings.",
                fr: "La liste se met à jour automatiquement à mesure que chaque étape est effectuée dans les paramètres du compte.",
                pt: "A lista atualiza-se automaticamente à medida que cada passo é concluído nas definições da conta.",
              })}
            </div>
          </Show>
        </div>
      </Show>

      <Show when={phase() === "report"}>
        {(() => {
          const rep = () => report();
          return (
            <div class="flex flex-col gap-4">
              <InstanceList items={rep()?.instances ?? []} />
              <For each={rep()?.warnings ?? []}>
                {(warning) => <div class="text-warning text-sm">{warning}</div>}
              </For>
              <div class="flex gap-2">
                <Show
                  when={rep()?.instances.every((i) => i.status === "updated" && (i.projectsFailed?.length ?? 0) === 0)}
                  fallback={
                    <Button onClick={execute.click} state={execute.state()} intent="primary">
                      {t3({ en: "Retry", fr: "Réessayer", pt: "Tentar novamente" })}
                    </Button>
                  }
                >
                  <div class="text-success text-sm">
                    {t3({ en: "Your email was changed everywhere.", fr: "Votre e-mail a été changé partout.", pt: "O seu e-mail foi alterado em todo o lado." })}
                  </div>
                </Show>
                <Button onClick={finish.click} state={finish.state()} intent="primary">
                  {t3({ en: "Finish and reload", fr: "Terminer et recharger", pt: "Concluir e recarregar" })}
                </Button>
              </div>
            </div>
          );
        })()}
      </Show>
    </ModalContainer>
  );
}
