import { type AssetPrivacy, type OtherUser, t3, TC } from "lib";
import {
  type AlertComponentProps,
  createFormAction,
  Icon,
  ModalContainer,
  MultiSelectSearch,
  RadioGroup,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

export function userDisplayName(
  u: Pick<OtherUser, "email" | "firstName" | "lastName">,
): string {
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

function ViewerPicker(
  p: { values: string[]; onChange: (v: string[]) => void },
) {
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
        pt: "Só para si",
      })}
      values={p.values}
      options={viewerOptions()}
      onChange={p.onChange}
      fullWidth
    />
  );
}

const PRIVATE_EXPLAINER = {
  en:
    "A private file is hidden from everyone except you and the people you choose, including administrators. Reports, slide decks or imports that use it will not work for anyone else.",
  fr:
    "Un fichier privé est masqué pour tout le monde sauf vous et les personnes que vous choisissez, y compris les administrateurs. Les rapports, présentations ou importations qui l'utilisent ne fonctionneront pour personne d'autre.",
  pt:
    "Um ficheiro privado fica oculto para todos exceto para si e para as pessoas que escolher, incluindo os administradores. Os relatórios, apresentações ou importações que o utilizem não funcionarão para mais ninguém.",
};

type Visibility = "everyone" | "private";

function visibilityOptions() {
  return [
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
  ];
}

export type AssetUploadChoice = {
  files: File[];
  isPrivate: boolean;
  viewerEmails: string[];
};

// The one way to upload assets: who will see the files, then a drop zone at
// the bottom. Dropping or choosing files closes the dialog with them; the
// caller hands them to the upload, privacy riding in each file's metadata.
export function UploadAssetsForm(
  p: AlertComponentProps<void, AssetUploadChoice>,
) {
  const [visibility, setVisibility] = createSignal<Visibility>("everyone");
  const [viewers, setViewers] = createSignal<string[]>([]);
  const [dragging, setDragging] = createSignal(false);
  let input: HTMLInputElement | undefined;

  function take(list: FileList | null | undefined) {
    const files = list ? [...list] : [];
    if (files.length === 0) return;
    const isPrivate = visibility() === "private";
    p.close({ files, isPrivate, viewerEmails: isPrivate ? viewers() : [] });
  }

  return (
    <ModalContainer
      title={t3({
        en: "Upload files",
        fr: "Téléverser des fichiers",
        pt: "Carregar ficheiros",
      })}
      width="md"
      onCancel={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <RadioGroup
          label={t3({
            en: "Who can see these files",
            fr: "Qui peut voir ces fichiers",
            pt: "Quem pode ver estes ficheiros",
          })}
          value={visibility()}
          options={visibilityOptions()}
          onChange={setVisibility}
        />
        <Show when={visibility() === "private"}>
          <p class="text-base-content-muted text-sm">
            {t3(PRIVATE_EXPLAINER)}
          </p>
          <ViewerPicker values={viewers()} onChange={setViewers} />
        </Show>
        <div
          role="button"
          tabindex="0"
          class="ui-pad-lg ui-focusable flex cursor-pointer flex-col items-center gap-2 rounded border-2 border-dashed text-center transition-colors"
          classList={{
            "border-primary bg-primary-subtle": dragging(),
            "hover:border-primary": !dragging(),
          }}
          onClick={() => input?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              input?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            take(e.dataTransfer?.files);
          }}
        >
          <Icon iconName="upload" />
          <div>
            {t3({
              en: "Drag and drop files here, or click to choose",
              fr:
                "Glissez-déposez des fichiers ici, ou cliquez pour les choisir",
              pt: "Arraste e largue ficheiros aqui, ou clique para escolher",
            })}
          </div>
          <input
            ref={input}
            type="file"
            multiple
            class="hidden"
            onChange={(e) => take(e.currentTarget.files)}
          />
        </div>
      </div>
    </ModalContainer>
  );
}

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

  const save = createFormAction(
    async () =>
      await serverActions.updateAssetVisibility({
        fileName: p.fileName,
        isPrivate: visibility() === "private",
        viewerEmails: visibility() === "private" ? viewers() : [],
      }),
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
        label: t3(TC.save),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div class="ui-spy">
        <div class="font-mono text-sm">{p.fileName}</div>
        <RadioGroup
          value={visibility()}
          options={visibilityOptions()}
          onChange={setVisibility}
        />
        <Show when={visibility() === "private"}>
          <p class="text-base-content-muted text-sm">
            {t3(PRIVATE_EXPLAINER)}
          </p>
          <ViewerPicker values={viewers()} onChange={setViewers} />
        </Show>
      </div>
    </ModalContainer>
  );
}
