import { t3, type UserProfile } from "lib";
import {
  type AlertComponentProps,
  createButtonAction,
  Input,
  ModalContainer,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

// Asked once, after approval, while the user has told us nothing about
// themselves; skippable, and edited later from the profile. The answer goes
// to the users table, where admins read it on the Users page.
export function ProfilePromptModal(
  p: AlertComponentProps<{ initial: UserProfile }, undefined>,
) {
  const [organisation, setOrganisation] = createSignal(
    p.initial.organisation ?? "",
  );
  const [role, setRole] = createSignal(p.initial.role ?? "");
  const save = createButtonAction(
    () =>
      serverActions.updateMyProfile({
        organisation: organisation(),
        role: role(),
      }),
    () => p.close(undefined),
  );
  return (
    <ModalContainer
      width="sm"
      title={t3({
        en: "About you",
        fr: "À propos de vous",
        pt: "Sobre si",
      })}
      onCancel={() => p.close(undefined)}
      cancelLabel={t3({
        en: "Skip for now",
        fr: "Passer pour l'instant",
        pt: "Ignorar por agora",
      })}
      cancelDisabled={save.state().status === "loading"}
      actions={[
        {
          label: t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" }),
          onClick: save.click,
          state: save.state(),
          disabled: !organisation().trim() && !role().trim(),
        },
      ]}
    >
      <div class="flex flex-col gap-3">
        <p class="text-base-content text-sm">
          {t3({
            en:
              "Which organisation are you a part of, and what is your role there? This helps the team that runs the platform know who is using it.",
            fr:
              "À quelle organisation appartenez-vous, et quel y est votre rôle ? Cela aide l'équipe qui gère la plateforme à savoir qui l'utilise.",
            pt:
              "De que organização faz parte e qual é o seu papel? Isto ajuda a equipa que gere a plataforma a saber quem a utiliza.",
          })}
        </p>
        <Input
          label={t3({
            en: "Organisation",
            fr: "Organisation",
            pt: "Organização",
          })}
          value={organisation()}
          onChange={setOrganisation}
          fullWidth
          autoFocus
        />
        <Input
          label={t3({ en: "Role", fr: "Rôle", pt: "Função" })}
          value={role()}
          onChange={setRole}
          placeholder={t3({
            en: "e.g. M&E officer, Ministry of Health",
            fr: "p. ex. chargé de S&E, ministère de la Santé",
            pt: "p. ex. técnico de M&A, Ministério da Saúde",
          })}
          fullWidth
        />
      </div>
    </ModalContainer>
  );
}
