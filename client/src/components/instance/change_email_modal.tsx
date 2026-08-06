import { t3 } from "lib";
import type { RenameEmailInstanceResult } from "lib";
import type { EmailAddressResource } from "@clerk/types";
import {
  type AlertComponentProps,
  Button,
  ModalContainer,
  TextArea,
  createButtonAction,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { clerk } from "~/components/LoggedInWrapper";
import { serverActions } from "~/server_actions";

// Self-service email change, everywhere at once. Two deliberate acts, the
// rest automatic:
//   1. enter  — type the new address, one button: the fleet preview runs and,
//               unless it finds a conflict (or the account nowhere), the
//               address is added to the caller's Clerk account and a
//               verification code is emailed to it. Already-verified
//               addresses (a previous half-attempt) skip straight to the
//               rename.
//   2. verify — type the code. A correct code runs everything with no
//               further clicks, in this exact order: every instance renames
//               FIRST (the route must authorize while the session JWT still
//               matches the old users rows), THEN the Clerk primary flips and
//               the token refreshes to the new identity, and — only on an
//               all-green report — the old address is removed from Clerk as
//               the very last step.
//   3. report — per-instance outcome. Partial failure keeps the old address
//               on the account and offers Retry (idempotent end-to-end);
//               all-green ends with Done → reload, since the SPA's identity
//               state is stale after a self-rename.

function clerkErrMessage(error: unknown): string {
  const e = error as { errors?: { longMessage?: string; message?: string }[] };
  return e.errors?.[0]?.longMessage ?? e.errors?.[0]?.message ??
    (error instanceof Error ? error.message : String(error));
}

export function ChangeEmailModal(
  p: AlertComponentProps<{ currentEmail: string }, undefined>,
) {
  const [phase, setPhase] = createSignal<"enter" | "verify" | "report">("enter");
  const [newEmail, setNewEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [preview, setPreview] = createSignal<RenameEmailInstanceResult[]>([]);
  const [report, setReport] = createSignal<
    { instances: RenameEmailInstanceResult[]; warnings: string[] } | null
  >(null);
  const [primaryDone, setPrimaryDone] = createSignal(false);

  const oldEmail = p.currentEmail.toLowerCase();
  const cleanNewEmail = () => newEmail().trim().toLowerCase();

  const findNewAddress = (): EmailAddressResource | undefined =>
    clerk.user?.emailAddresses.find(
      (a) => a.emailAddress.toLowerCase() === cleanNewEmail(),
    );

  const allGreen = (instances: RenameEmailInstanceResult[]) =>
    instances.length > 0 &&
    instances.every(
      (i) => i.status === "updated" && (i.projectsFailed?.length ?? 0) === 0,
    );

  // Fleet rename → primary flip + token refresh → (all-green only)
  // old-address removal. The rename MUST come first: the route authorizes
  // against the users rows, which still carry the old email — flipping the
  // Clerk primary before the call would make the session resolve to an email
  // with no row and get rejected. Shared by the verify step and the report's
  // Retry; every part is safe to re-run.
  async function runRename(): Promise<{ success: true } | { success: false; err: string }> {
    const address = findNewAddress();
    if (!address || address.verification?.status !== "verified") {
      return {
        success: false,
        err: t3({ en: "The new address is not verified yet", fr: "La nouvelle adresse n'est pas encore vérifiée", pt: "O novo endereço ainda não está verificado" }),
      };
    }
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
    let primaryFlipped = false;
    if (res.data.instances.some((i) => i.status === "updated")) {
      try {
        if (clerk.user?.primaryEmailAddressId !== address.id) {
          await clerk.user?.update({ primaryEmailAddressId: address.id });
        }
        await clerk.session?.getToken({ skipCache: true });
        primaryFlipped = true;
        setPrimaryDone(true);
      } catch {
        // Rows are renamed but the Clerk primary still points at the old
        // address — Retry re-runs this flip (the rename side no-ops).
      }
    }
    if (primaryFlipped && allGreen(res.data.instances)) {
      // Deliberately the last step, and only when everything renamed: until
      // then the old address stays on the account as the recovery path. A
      // failure here is harmless — the address can be removed in account
      // settings later.
      const old = clerk.user?.emailAddresses.find(
        (a) => a.emailAddress.toLowerCase() === oldEmail,
      );
      await old?.destroy().catch(() => {});
      // The signed-in identity just changed under the SPA's feet — reload
      // unconditionally rather than leave a stale session on screen.
      window.location.reload();
    }
    return { success: true };
  }

  const start = createButtonAction(async () => {
    const email = cleanNewEmail();
    if (email.length === 0 || email === oldEmail) {
      return {
        success: false,
        err: t3({ en: "Enter a new email address", fr: "Saisissez une nouvelle adresse e-mail", pt: "Introduza um novo endereço de e-mail" }),
      };
    }
    const res = await serverActions.renameUserEmailEverywhere({
      oldEmail,
      newEmail: email,
      dryRun: true,
    });
    if (!res.success) {
      return res;
    }
    setPreview(res.data.instances);
    if (res.data.instances.length === 0) {
      return {
        success: false,
        err: t3({ en: "Your account was not found on any instance", fr: "Votre compte n'a été trouvé sur aucune instance", pt: "A sua conta não foi encontrada em nenhuma instância" }),
      };
    }
    if (res.data.instances.some((i) => i.status === "conflict")) {
      return {
        success: false,
        err: t3({
          en: "The new email already belongs to another user on the instances marked below — resolve that first",
          fr: "Le nouvel e-mail appartient déjà à un autre utilisateur sur les instances indiquées ci-dessous — résolvez cela d'abord",
          pt: "O novo e-mail já pertence a outro utilizador nas instâncias indicadas abaixo — resolva isso primeiro",
        }),
      };
    }
    try {
      let address = findNewAddress();
      if (!address) {
        address = await clerk.user!.createEmailAddress({ email });
      }
      if (address.verification?.status === "verified") {
        return await runRename();
      }
      await address.prepareVerification({ strategy: "email_code" });
    } catch (error) {
      return { success: false, err: clerkErrMessage(error) };
    }
    setPhase("verify");
    return { success: true };
  });

  const verify = createButtonAction(async () => {
    const address = findNewAddress();
    if (!address) {
      return {
        success: false,
        err: t3({ en: "The new address is missing from your account — start again", fr: "La nouvelle adresse manque sur votre compte — recommencez", pt: "O novo endereço não consta da sua conta — recomece" }),
      };
    }
    if (address.verification?.status !== "verified") {
      if (code().trim().length === 0) {
        return {
          success: false,
          err: t3({ en: "Enter the code from the email", fr: "Saisissez le code reçu par e-mail", pt: "Introduza o código recebido por e-mail" }),
        };
      }
      try {
        await address.attemptVerification({ code: code().trim() });
      } catch (error) {
        return { success: false, err: clerkErrMessage(error) };
      }
    }
    return await runRename();
  });

  const resend = createButtonAction(async () => {
    try {
      await findNewAddress()?.prepareVerification({ strategy: "email_code" });
      return { success: true };
    } catch (error) {
      return { success: false, err: clerkErrMessage(error) };
    }
  });

  const retry = createButtonAction(() => runRename());

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

  return (
    <ModalContainer
      title={t3({ en: "Change email", fr: "Changer d'e-mail", pt: "Alterar e-mail" })}
      width="lg"
      leftButtons={[
        phase() === "report"
          ? (
            <Button onClick={() => window.location.reload()} outline iconName="x">
              {t3({ en: "Reload", fr: "Recharger", pt: "Recarregar" })}
            </Button>
          )
          : (
            <Button onClick={() => p.close(undefined)} outline iconName="x">
              {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
            </Button>
          ),
      ]}
    >
      <Show when={phase() === "enter"}>
        <div class="flex flex-col gap-4">
          <div class="text-sm">
            {t3({
              en: "This changes your email on every FASTR instance you have access to, keeping all your permissions and history. You will need to enter a code sent to the new address.",
              fr: "Ceci change votre e-mail sur toutes les instances FASTR auxquelles vous avez accès, en conservant vos permissions et votre historique. Vous devrez saisir un code envoyé à la nouvelle adresse.",
              pt: "Isto altera o seu e-mail em todas as instâncias FASTR a que tem acesso, mantendo as suas permissões e o seu histórico. Terá de introduzir um código enviado para o novo endereço.",
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
          <Show when={preview().length > 0}>
            <InstanceList items={preview()} />
          </Show>
          <div>
            <Button
              onClick={start.click}
              state={start.state()}
              intent="primary"
              disabled={cleanNewEmail().length === 0}
            >
              {t3({ en: "Continue", fr: "Continuer", pt: "Continuar" })}
            </Button>
          </div>
        </div>
      </Show>

      <Show when={phase() === "verify"}>
        <div class="flex flex-col gap-4">
          <div class="text-sm">
            {t3({ en: "Your account was found on these instances:", fr: "Votre compte a été trouvé sur ces instances :", pt: "A sua conta foi encontrada nestas instâncias:" })}
          </div>
          <InstanceList items={preview()} />
          <div class="border-t pt-4 text-sm">
            {t3({ en: "Enter the code sent to", fr: "Saisissez le code envoyé à", pt: "Introduza o código enviado para" })}{" "}
            <span class="font-700">{cleanNewEmail()}</span>.{" "}
            {t3({
              en: "A correct code completes the change everywhere automatically.",
              fr: "Un code correct effectue le changement partout automatiquement.",
              pt: "Um código correto conclui a alteração em todo o lado automaticamente.",
            })}
          </div>
          <TextArea
            label={t3({ en: "Verification code", fr: "Code de vérification", pt: "Código de verificação" })}
            value={code()}
            onChange={setCode}
            fullWidth
            rows={1}
            autoFocus
          />
          <div class="flex gap-2">
            <Button
              onClick={verify.click}
              state={verify.state()}
              intent="danger"
              disabled={code().trim().length === 0}
            >
              {t3({ en: "Verify and rename everywhere", fr: "Vérifier et renommer partout", pt: "Verificar e renomear em todo o lado" })}
            </Button>
            <Button onClick={resend.click} state={resend.state()} outline>
              {t3({ en: "Resend code", fr: "Renvoyer le code", pt: "Reenviar o código" })}
            </Button>
          </div>
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
              <Show
                when={allGreen(rep()?.instances ?? []) && primaryDone()}
                fallback={
                  <div class="flex flex-col gap-2">
                    <div class="text-warning text-sm">
                      {t3({
                        en: "Not everything was renamed yet. Your old address stays on your account until it completes — retrying is safe.",
                        fr: "Tout n'a pas encore été renommé. Votre ancienne adresse reste sur votre compte jusqu'à la fin — réessayer est sans risque.",
                        pt: "Ainda não foi tudo renomeado. O seu endereço antigo permanece na sua conta até à conclusão — tentar novamente é seguro.",
                      })}
                    </div>
                    <div>
                      <Button onClick={retry.click} state={retry.state()} intent="primary">
                        {t3({ en: "Retry", fr: "Réessayer", pt: "Tentar novamente" })}
                      </Button>
                    </div>
                  </div>
                }
              >
                <div class="text-success text-sm">
                  {t3({ en: "Your email was changed everywhere. Reloading…", fr: "Votre e-mail a été changé partout. Rechargement…", pt: "O seu e-mail foi alterado em todo o lado. A recarregar…" })}
                </div>
              </Show>
            </div>
          );
        })()}
      </Show>
    </ModalContainer>
  );
}
