import { type AssetPrivacy, type OtherUser, t3 } from "lib";
import {
  type AlertComponentProps,
  createFormAction,
  ModalContainer,
  MultiSelectSearch,
  RadioGroup,
} from "panther";
import { createMemo, createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

export function userDisplayName(u: Pick<OtherUser, "email" | "firstName" | "lastName">): string {
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name ? `${name} (${u.email})` : u.email;
}

// Everyone on the instance except the current user (an owner always sees
// their own file).
function viewerOptions() {
  return instanceState.users
    .filter((u) => u.email !== instanceState.currentUserEmail)
    .map((u) => ({ value: u.email, label: userDisplayName(u) }));
}

function ViewerPicker(p: { values: string[]; onChange: (v: string[]) => void }) {
  return (
    <MultiSelectSearch
      label={t3({
        en: "People who can see it",
        fr: "Personnes qui peuvent le voir",
        pt: "Pessoas que o podem ver",
      })}
      placeholder={t3({
        en: "Only you",
        fr: "Vous seulement",
        pt: "Apenas você",
      })}
      values={p.values}
      options={viewerOptions()}
      onChange={p.onChange}
      fullWidth
    />
  );
}

const PRIVATE_EXPLAINER = {
  en: "A private file is hidden from everyone except you and the people you choose, including administrators. Reports, slide decks or imports that use it will not work for anyone else.",
  fr: "Un fichier privé est masqué pour tout le monde sauf vous et les personnes que vous choisissez, y compris les administrateurs. Les rapports, présentations ou importations qui l'utilisent ne fonctionneront pour personne d'autre.",
  pt: "Um ficheiro privado fica oculto para todos exceto você e as pessoas que escolher, incluindo os administradores. Relatórios, apresentações ou importações que o utilizem não funcionarão para mais ninguém.",
};

// Before a private upload: who will be able to see the files. Returns the
// chosen viewers; the caller attaches them to the upload's metadata.
export function PrivateUploadForm(
  p: AlertComponentProps<void, { viewerEmails: string[] }>,
) {
  const [viewers, setViewers] = createSignal<string[]>([]);
  return (
    <ModalContainer
      title={t3({
        en: "Upload private files",
        fr: "Téléverser des fichiers privés",
        pt: "Carregar ficheiros privados",
      })}
      width="md"
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({
          en: "Choose files",
          fr: "Choisir les fichiers",
          pt: "Escolher ficheiros",
        }),
        onClick: () => p.close({ viewerEmails: viewers() }),
      }]}
    >
      <div class="ui-spy">
        <p class="text-base-content-muted text-sm">{t3(PRIVATE_EXPLAINER)}</p>
        <ViewerPicker values={viewers()} onChange={setViewers} />
      </div>
    </ModalContainer>
  );
}

type Visibility = "everyone" | "private";

// Change who can see an existing file (its owner only; the server enforces).
export function AssetSharingForm(
  p: AlertComponentProps<
    { fileName: string; privacy: AssetPrivacy | null },
    undefined
  >,
) {
  const [visibility, setVisibility] = createSignal<Visibility>(
    p.privacy ? "private" : "everyone",
  );
  const [viewers, setViewers] = createSignal<string[]>(
    p.privacy?.viewerEmails ?? [],
  );

  const options = createMemo(() => [
    {
      value: "everyone" as const,
      label: t3({
        en: "Everyone who can see assets",
        fr: "Tous ceux qui peuvent voir les ressources",
        pt: "Todos os que podem ver os recursos",
      }),
    },
    {
      value: "private" as const,
      label: t3({
        en: "Only me and the people I choose",
        fr: "Seulement moi et les personnes que je choisis",
        pt: "Apenas eu e as pessoas que escolher",
      }),
    },
  ]);

  const save = createFormAction(
    async () =>
      await serverActions.updateAssetVisibility({
        fileName: p.fileName,
        isPrivate: visibility() === "private",
        viewerEmails: visibility() === "private" ? viewers() : [],
      }),
    async () => {},
    () => p.close(undefined),
  );

  return (
    <ModalContainer
      title={t3({
        en: "Who can see this file",
        fr: "Qui peut voir ce fichier",
        pt: "Quem pode ver este ficheiro",
      })}
      width="md"
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" }),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div class="ui-spy">
        <div class="font-mono text-sm">{p.fileName}</div>
        <RadioGroup
          value={visibility()}
          options={options()}
          onChange={setVisibility}
        />
        <Show when={visibility() === "private"}>
          <p class="text-base-content-muted text-sm">{t3(PRIVATE_EXPLAINER)}</p>
          <ViewerPicker values={viewers()} onChange={setViewers} />
        </Show>
      </div>
    </ModalContainer>
  );
}
