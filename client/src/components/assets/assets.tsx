import {
  type BulkAction,
  Button,
  createDeleteAction,
  createTableConfig,
  FrameTop,
  Icon,
  openComponent,
  plural,
  Table,
  type TableColumn,
} from "panther";
import { createMemo, onCleanup, onMount, Show } from "solid-js";
import { AssetInfo, canUserManagePrivateAsset, t3, TC } from "lib";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions";
import { cleanupUppy, createUppyInstance } from "~/components/_shared/mod.ts";
import type Uppy from "@uppy/core";
import { instanceState } from "~/state/instance/t1_store";
import {
  copilotViewController,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";
import {
  AssetSharingForm,
  UploadAssetsForm,
  userDisplayName,
} from "./asset_sharing.tsx";

type FileType = "csv" | "excel" | "image" | "zip" | "other";

const FILE_TYPE_LABELS: Record<
  FileType,
  { en: string; fr: string; pt: string }
> = {
  csv: { en: "CSV", fr: "CSV", pt: "CSV" },
  excel: { en: "Excel", fr: "Excel", pt: "Excel" },
  image: { en: "Image", fr: "Image", pt: "Imagem" },
  zip: { en: "ZIP", fr: "ZIP", pt: "ZIP" },
  other: { en: "Other", fr: "Autre", pt: "Outro" },
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
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + "\u00a0" + sizes[i];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

export function InstanceAssets() {
  holdCopilotView();
  copilotViewController.setView("assets");
  // Uppy carries the transfer and shows its progress; the files and who may
  // see them are picked in UploadAssetsForm. Privacy rides in each file's TUS
  // metadata ("public" or "private" plus viewers), so the server applies it
  // before the file lands.
  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({ maxNumberOfFiles: 0 });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  async function startUpload() {
    const res = await openComponent({
      element: UploadAssetsForm,
      props: undefined,
    });
    if (!res || !uppy) return;
    // Opening the progress dialog clears Uppy's files, so it opens first.
    // deno-lint-ignore no-explicit-any
    await (uppy.getPlugin("Dashboard") as any)?.openModal();
    const meta = res.isPrivate
      ? {
        fastrVisibility: "private",
        fastrViewers: res.viewerEmails.join(","),
      }
      : { fastrVisibility: "public" };
    for (const file of res.files) {
      try {
        uppy.addFile({ name: file.name, type: file.type, data: file, meta });
      } catch {
        // Uppy reports a refused file (a duplicate) in its own dialog.
      }
    }
    void uppy.upload();
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
          pt:
            "Tem a certeza de que pretende eliminar este ficheiro de recurso?",
        }),
        itemList: [assetFileName],
      },
      () => serverActions.deleteAssets({ assetFileNames: [assetFileName] }),
    );
    await deleteAction.click();
  }

  return (
    <FrameTop pad="md">
      <div class="h-full w-full" data-tour="instance-assets-list">
        <AssetTable
          files={instanceState.assets}
          currentUserEmail={instanceState.currentUserEmail}
          isAdmin={instanceState.currentUserIsGlobalAdmin}
          onDelete={attemptDeleteAssetFile}
          onEditSharing={editSharing}
          onUpload={startUpload}
        />
      </div>
    </FrameTop>
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
  onUpload: () => void;
}) {
  const assetsTable = createTableConfig({
    sort: { key: "fileName", direction: "asc" },
  });

  const columns = createMemo((): TableColumn<AssetInfo>[] => [
    {
      key: "fileName",
      header: t3({
        en: "File Name",
        fr: "Nom du fichier",
        pt: "Nome do ficheiro",
      }),
      sortable: true,
      render: (asset) => <span class="font-mono">{asset.fileName}</span>,
    },
    {
      key: "fileType",
      header: t3({ en: "Type", fr: "Type", pt: "Tipo" }),
      sortable: true,
      sortValue: (asset) => FILE_TYPE_ORDER.indexOf(getFileType(asset)),
      filterable: true,
      filterValue: (asset) => t3(FILE_TYPE_LABELS[getFileType(asset)]),
      render: (asset) => t3(FILE_TYPE_LABELS[getFileType(asset)]),
    },
    {
      key: "size",
      header: t3({ en: "Size", fr: "Taille", pt: "Tamanho" }),
      sortable: true,
      searchable: false,
      render: (asset) => (
        <span class="text-base-content-muted">
          {formatFileSize(asset.size)}
        </span>
      ),
    },
    {
      key: "lastModified",
      header: t3({ en: "Modified", fr: "Modifié", pt: "Modificado" }),
      sortable: true,
      sortDescFirst: true,
      searchable: false,
      render: (asset) => (
        <span class="text-base-content-muted">
          {formatDate(asset.lastModified)}
        </span>
      ),
    },
    {
      key: "uploaderEmail",
      header: t3({ en: "Owner", fr: "Propriétaire", pt: "Proprietário" }),
      sortable: true,
      filterable: true,
      filterValue: (asset) =>
        asset.uploaderEmail ??
          t3({ en: "System", fr: "Système", pt: "Sistema" }),
      render: (asset) => (
        <Show
          when={asset.uploaderEmail}
          fallback={
            <span class="text-base-content-muted">
              {t3({ en: "System", fr: "Système", pt: "Sistema" })}
            </span>
          }
        >
          <span>{asset.uploaderEmail}</span>
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
      sortable: true,
      searchable: false,
      sortValue: (asset) =>
        asset.privacy ? 1 + asset.privacy.viewerEmails.length : 0,
      render: (asset) => (
        <Show
          when={asset.privacy}
          fallback={
            <span class="text-base-content-muted">
              {t3({ en: "Everyone", fr: "Tout le monde", pt: "Todos" })}
            </span>
          }
        >
          {(privacy) => (
            <span
              class="ui-gap-sm flex items-center"
              title={visibilityLabel(asset)}
            >
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
                  pt:
                    `Privado: proprietário + ${privacy().viewerEmails.length}`,
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
      pullInY: true,
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
        const canDownload = !(asset.isCsv || asset.isXlsx || asset.isZip) ||
          instanceState.currentUserIsGlobalAdmin ||
          instanceState.currentUserPermissions.can_view_data ||
          instanceState.currentUserPermissions.can_configure_data;
        return (
          <div class="flex items-center justify-end">
            <Show
              when={canEditSharing(asset, p.currentUserEmail, p.isAdmin)}
            >
              <Button
                intent="base-100"
                size="sm"
                iconName="users"
                ariaLabel={t3({
                  en: "Who can see it",
                  fr: "Qui peut le voir",
                  pt: "Quem o pode ver",
                })}
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  p.onEditSharing(asset);
                }}
              />
            </Show>
            <Show when={canDownload}>
              <Button
                intent="base-100"
                size="sm"
                iconName="download"
                ariaLabel={t3({
                  en: "Download",
                  fr: "Télécharger",
                  pt: "Transferir",
                })}
                href={`${_SERVER_HOST}/${encodeURIComponent(asset.fileName)}`}
                download={asset.fileName}
              />
            </Show>
            <Show when={canDelete}>
              <Button
                iconName="trash"
                intent="base-100"
                size="sm"
                ariaLabel={t3({
                  en: "Delete",
                  fr: "Supprimer",
                  pt: "Eliminar",
                })}
                onClick={() => p.onDelete(asset.fileName)}
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
        text: plural(assetFileNames.length, {
          one: t3({
            en: "Are you sure you want to delete this asset file?",
            fr: "Êtes-vous sûr de vouloir supprimer ce fichier ressource ?",
            pt:
              "Tem a certeza de que pretende eliminar este ficheiro de recurso?",
          }),
          other: t3({
            en: "Are you sure you want to delete these asset files?",
            fr: "Êtes-vous sûr de vouloir supprimer ces fichiers ressources ?",
            pt:
              "Tem a certeza de que pretende eliminar estes ficheiros de recurso?",
          }),
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
      config={assetsTable}
      noRowsMessage={t3({
        en: "No assets uploaded yet",
        fr: "Aucune ressource téléversée",
        pt: "Ainda não foram carregados recursos",
      })}
      bulkActions={bulkActions()}
      itemLabel={{
        one: t3({ en: "asset", fr: "ressource", pt: "recurso" }),
        other: t3({ en: "assets", fr: "ressources", pt: "recursos" }),
      }}
      toolbar={{
        search: true,
        children: (
          <div class="ui-gap-sm flex items-center">
            <Button
              id="select-file-button"
              iconName="upload"
              onClick={p.onUpload}
            >
              {t3({ en: "Upload", fr: "Téléverser", pt: "Carregar" })}
            </Button>
          </div>
        ),
      }}
    />
  );
}
