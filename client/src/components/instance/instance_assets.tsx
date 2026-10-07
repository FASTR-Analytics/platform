import {
  Button,
  FrameTop,
  Icon,
  Table,
  TabsNavigation,
  createDeleteAction,
  openComponent,
  type BulkAction,
  type ListItem,
  type TableColumn,
} from "panther";
import { HeadingBar } from "panther";
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { AssetInfo, canUserManagePrivateAsset, t3, TC } from "lib";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions";
import {
  createUppyInstance,
  cleanupUppy,
} from "~/components/_uppy_file_upload";
import type Uppy from "@uppy/core";
import { instanceState } from "~/state/instance/t1_store";
import {
  AssetSharingForm,
  PrivateUploadForm,
  userDisplayName,
} from "./asset_sharing";

type FileType = "csv" | "excel" | "image" | "zip" | "other";

const FILE_TYPE_LABELS: Record<
  FileType,
  { en: string; fr: string; pt: string }
> = {
  csv: { en: "CSV files", fr: "Fichiers CSV", pt: "Ficheiros CSV" },
  excel: { en: "Excel files", fr: "Fichiers Excel", pt: "Ficheiros Excel" },
  image: { en: "Images", fr: "Images", pt: "Imagens" },
  zip: { en: "ZIP files", fr: "Fichiers ZIP", pt: "Ficheiros ZIP" },
  other: { en: "Other files", fr: "Autres fichiers", pt: "Outros ficheiros" },
};

const FILE_TYPE_ORDER: FileType[] = ["csv", "excel", "image", "zip", "other"];

function getFileType(asset: AssetInfo): FileType {
  if (asset.isCsv) return "csv";
  if (asset.isXlsx) return "excel";
  if (asset.isImage) return "image";
  if (asset.isZip) return "zip";
  return "other";
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

export function InstanceAssets() {
  let uppy: Uppy | undefined = undefined;
  // A second instance for private uploads, opened only after the viewers are
  // chosen. Privacy rides in each file's TUS metadata, set as the file is
  // added (the modal-open clear would wipe anything set earlier), so the
  // server applies it before the file lands.
  let privateUppy: Uppy | undefined = undefined;
  let privateViewerEmails: string[] = [];

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-file-button",
      maxNumberOfFiles: 0,
    });
    privateUppy = createUppyInstance({
      triggerId: "#private-upload-trigger",
      maxNumberOfFiles: 0,
    });
    privateUppy.on("file-added", (file) => {
      privateUppy?.setFileMeta(file.id, {
        fastrVisibility: "private",
        fastrViewers: privateViewerEmails.join(","),
      });
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
    cleanupUppy(privateUppy);
  });

  async function startPrivateUpload() {
    const res = await openComponent({
      element: PrivateUploadForm,
      props: undefined,
    });
    if (!res || !privateUppy) return;
    privateViewerEmails = res.viewerEmails;
    // deno-lint-ignore no-explicit-any
    (privateUppy.getPlugin("Dashboard") as any)?.openModal();
  }

  async function editSharing(asset: AssetInfo) {
    await openComponent({
      element: AssetSharingForm,
      props: { fileName: asset.fileName, privacy: asset.privacy },
    });
  }

  async function attemptDeleteAssetFile(assetFileName: string) {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Are you sure you want to delete this asset file?",
          fr: "Êtes-vous sûr de vouloir supprimer ce fichier ressource ?",
          pt: "Tem a certeza de que pretende eliminar este ficheiro de recurso?",
        }),
        itemList: [assetFileName],
      },
      () => serverActions.deleteAssets({ assetFileNames: [assetFileName] }),
    );
    await deleteAction.click();
  }

  return (
    <FrameTop
      panelChildren={
        <div class="h-full w-full">
          <HeadingBar
            data-tour="instance-assets-header"
            tonal
            heading={t3({ en: "Assets", fr: "Ressources", pt: "Recursos" })}
          >
            <div class="ui-gap-sm flex items-center">
              <Button
                outline
                iconName="eyeOff"
                onClick={startPrivateUpload}
              >
                {t3({
                  en: "Upload private",
                  fr: "Téléverser en privé",
                  pt: "Carregar em privado",
                })}
              </Button>
              <Button id="select-file-button" iconName="upload">
                {t3({ en: "Upload", fr: "Téléverser", pt: "Carregar" })}
              </Button>
            </div>
          </HeadingBar>
        </div>
      }
    >
      <AssetFileSystem
        assets={instanceState.assets}
        currentUserEmail={instanceState.currentUserEmail}
        isAdmin={instanceState.currentUserIsGlobalAdmin}
        onDelete={attemptDeleteAssetFile}
        onEditSharing={editSharing}
      />
    </FrameTop>
  );
}

function AssetFileSystem(p: {
  assets: AssetInfo[];
  currentUserEmail: string;
  isAdmin: boolean;
  onDelete: (fileName: string) => void;
  onEditSharing: (asset: AssetInfo) => void;
}) {
  const [selectedType, setSelectedType] = createSignal<FileType>("csv");

  const grouped = createMemo(() => {
    const map = new Map<FileType, AssetInfo[]>();
    for (const type of FILE_TYPE_ORDER) {
      map.set(type, []);
    }
    for (const asset of p.assets) {
      map.get(getFileType(asset))!.push(asset);
    }
    return map;
  });

  const nonEmptyTypes = createMemo(() =>
    FILE_TYPE_ORDER.filter((t) => (grouped().get(t)?.length ?? 0) > 0),
  );

  const activeType = createMemo<FileType | undefined>(() => {
    const types = nonEmptyTypes();
    return types.includes(selectedType()) ? selectedType() : types[0];
  });

  const tabItems = createMemo<ListItem<FileType>[]>(() =>
    nonEmptyTypes().map((type) => ({
      id: type,
      label: t3(FILE_TYPE_LABELS[type]),
      // iconName: "folder",
      // badge: grouped().get(type)?.length ?? 0,
    })),
  );

  return (
    <Show
      when={activeType()}
      fallback={
        <p class="text-base-content-muted ui-pad text-sm">
          {t3({
            en: "No assets uploaded yet",
            fr: "Aucune ressource téléversée",
            pt: "Ainda não foram carregados recursos",
          })}
        </p>
      }
    >
      {(active) => (
        <FrameTop
          panelChildren={
            <TabsNavigation
              data-tour="instance-assets-tabs"
              items={tabItems()}
              value={active()}
              onChange={setSelectedType}
              insetRail
            />
          }
        >
          <div class="ui-pad h-full w-full" data-tour="instance-assets-list">
            <AssetTable
              files={grouped().get(active()) ?? []}
              currentUserEmail={p.currentUserEmail}
              isAdmin={p.isAdmin}
              onDelete={p.onDelete}
              onEditSharing={p.onEditSharing}
            />
          </div>
        </FrameTop>
      )}
    </Show>
  );
}

// Who may change a file's visibility: a private file's manager; a public
// file's uploader, or an admin for a file with no uploader (mirrors the
// server's updateAssetVisibility).
function canEditSharing(asset: AssetInfo, email: string, isAdmin: boolean) {
  if (asset.privacy) {
    return canUserManagePrivateAsset(asset.privacy, email, isAdmin);
  }
  return asset.uploaderEmail === email ||
    (asset.uploaderEmail === null && isAdmin);
}

function visibilityLabel(asset: AssetInfo): string {
  const privacy = asset.privacy;
  if (!privacy) return "";
  const names = privacy.viewerEmails.map((email) => {
    const u = instanceState.users.find((x) => x.email === email);
    return u ? userDisplayName(u) : email;
  });
  return names.join("\n");
}

function AssetTable(p: {
  files: AssetInfo[];
  currentUserEmail: string;
  isAdmin: boolean;
  onDelete: (fileName: string) => void;
  onEditSharing: (asset: AssetInfo) => void;
}) {
  const columns = createMemo((): TableColumn<AssetInfo>[] => [
    {
      key: "fileName",
      header: t3({
        en: "File Name",
        fr: "Nom du fichier",
        pt: "Nome do ficheiro",
      }),
      sortable: true,
      render: (asset) => (
        <span class="font-mono text-sm">{asset.fileName}</span>
      ),
    },
    {
      key: "size",
      header: t3({ en: "Size", fr: "Taille", pt: "Tamanho" }),
      sortable: true,
      render: (asset) => (
        <span class="text-base-content-muted text-sm">
          {formatFileSize(asset.size)}
        </span>
      ),
    },
    {
      key: "lastModified",
      header: t3({ en: "Modified", fr: "Modifié", pt: "Modificado" }),
      sortable: true,
      render: (asset) => (
        <span class="text-base-content-muted text-sm">
          {formatDate(asset.lastModified)}
        </span>
      ),
    },
    {
      key: "uploaderEmail",
      header: t3({ en: "Owner", fr: "Propriétaire", pt: "Proprietário" }),
      sortable: true,
      render: (asset) => (
        <Show
          when={asset.uploaderEmail}
          fallback={
            <span class="text-base-content-muted text-sm italic">
              {t3({ en: "system", fr: "système", pt: "sistema" })}
            </span>
          }
        >
          <span class="font-mono text-sm">{asset.uploaderEmail}</span>
        </Show>
      ),
    },
    {
      key: "privacy",
      header: t3({
        en: "Who can see it",
        fr: "Qui peut le voir",
        pt: "Quem o pode ver",
      }),
      render: (asset) => (
        <Show
          when={asset.privacy}
          fallback={
            <span class="text-base-content-muted text-sm">
              {t3({ en: "Everyone", fr: "Tout le monde", pt: "Todos" })}
            </span>
          }
        >
          {(privacy) => (
            <span class="ui-gap-sm flex items-center text-sm" title={visibilityLabel(asset)}>
              <span class="relative inline-flex h-[1.25em] w-[1.25em] flex-none">
                <Icon iconName="eyeOff" />
              </span>
              {privacy().viewerEmails.length === 0
                ? t3({
                  en: "Private: only the owner",
                  fr: "Privé : propriétaire seulement",
                  pt: "Privado: apenas o proprietário",
                })
                : t3({
                  en: `Private: owner + ${privacy().viewerEmails.length}`,
                  fr: `Privé : propriétaire + ${privacy().viewerEmails.length}`,
                  pt: `Privado: proprietário + ${privacy().viewerEmails.length}`,
                })}
            </span>
          )}
        </Show>
      ),
    },
    {
      key: "actions",
      header: "",
      alignH: "right",
      render: (asset) => {
        // A private file: its manager only (admins get no bypass), as on
        // the server's deleteAssets.
        const canDelete = asset.privacy
          ? canUserManagePrivateAsset(
            asset.privacy,
            p.currentUserEmail,
            p.isAdmin,
          )
          : p.isAdmin || asset.uploaderEmail === p.currentUserEmail;
        // Data-file bytes are served only to data-permitted users (S1's
        // static tier): hide the button rather than let the browser save a
        // 403 body to disk.
        const canDownload =
          !(asset.isCsv || asset.isXlsx || asset.isZip) ||
          instanceState.currentUserIsGlobalAdmin ||
          instanceState.currentUserPermissions.can_view_data ||
          instanceState.currentUserPermissions.can_configure_data;
        return (
          <div class="ui-gap-sm flex items-center justify-end">
            <Show
              when={canEditSharing(asset, p.currentUserEmail, p.isAdmin)}
            >
              <Button
                intent="base-100"
                iconName="users"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  p.onEditSharing(asset);
                }}
              />
            </Show>
            <Show when={canDownload}>
              <Button
                intent="base-100"
                iconName="download"
                href={`${_SERVER_HOST}/${encodeURIComponent(asset.fileName)}`}
                download={asset.fileName}
              />
            </Show>
            <Show when={canDelete}>
              <Button
                iconName="trash"
                intent="base-100"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  p.onDelete(asset.fileName);
                }}
              />
            </Show>
          </div>
        );
      },
    },
  ]);

  async function handleBulkDelete(selected: AssetInfo[]) {
    const assetFileNames = selected.map((a) => a.fileName);
    const deleteAction = createDeleteAction(
      {
        text:
          assetFileNames.length === 1
            ? t3({
                en: "Are you sure you want to delete this asset file?",
                fr: "Êtes-vous sûr de vouloir supprimer ce fichier ressource ?",
                pt: "Tem a certeza de que pretende eliminar este ficheiro de recurso?",
              })
            : t3({
                en: "Are you sure you want to delete these asset files?",
                fr: "Êtes-vous sûr de vouloir supprimer ces fichiers ressources ?",
                pt: "Tem a certeza de que pretende eliminar estes ficheiros de recurso?",
              }),
        itemList: assetFileNames,
      },
      () => serverActions.deleteAssets({ assetFileNames }),
    );
    await deleteAction.click();
  }

  const bulkActions = createMemo((): BulkAction<AssetInfo>[] => {
    if (!p.isAdmin) return [];
    return [
      {
        label: t3(TC.delete),
        intent: "danger",
        outline: true,
        onClick: handleBulkDelete,
      },
    ];
  });

  return (
    <Table
      data={p.files}
      columns={columns()}
      keyField="fileName"
      defaultSort={{ key: "fileName", direction: "asc" }}
      noRowsMessage={t3({
        en: "No assets",
        fr: "Aucune ressource",
        pt: "Sem recursos",
      })}
      bulkActions={bulkActions()}
      selectionLabel={t3({ en: "asset", fr: "ressource", pt: "recurso" })}
      fitTableToAvailableHeight
    />
  );
}
