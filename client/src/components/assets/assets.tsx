import {
  Button,
  FrameTop,
  Table,
  createDeleteAction,
  type BulkAction,
  type TableColumn,
} from "panther";
import { HeadingBar } from "panther";
import { Show, createMemo, onCleanup, onMount } from "solid-js";
import { AssetInfo, t3, TC } from "lib";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions";
import { createUppyInstance, cleanupUppy } from "~/components/_shared/mod.ts";
import type Uppy from "@uppy/core";
import { instanceState } from "~/state/instance/t1_store";

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
  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-file-button",
      maxNumberOfFiles: 0,
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

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
        <HeadingBar data-tour="instance-assets-header" compact>
          <Button id="select-file-button" iconName="upload" size="sm">
            {t3({ en: "Upload", fr: "Téléverser", pt: "Carregar" })}
          </Button>
        </HeadingBar>
      }
    >
      <div class="ui-pad h-full w-full" data-tour="instance-assets-list">
        <AssetTable
          files={instanceState.assets}
          currentUserEmail={instanceState.currentUserEmail}
          isAdmin={instanceState.currentUserIsGlobalAdmin}
          onDelete={attemptDeleteAssetFile}
        />
      </div>
    </FrameTop>
  );
}

function AssetTable(p: {
  files: AssetInfo[];
  currentUserEmail: string;
  isAdmin: boolean;
  onDelete: (fileName: string) => void;
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
      key: "actions",
      header: "",
      alignH: "right",
      render: (asset) => {
        const canDelete =
          p.isAdmin || asset.uploaderEmail === p.currentUserEmail;
        // Data-file bytes are served only to data-permitted users (S1's
        // static tier): hide the button rather than let the browser save a
        // 403 body to disk.
        const canDownload =
          !(asset.isCsv || asset.isXlsx || asset.isZip) ||
          instanceState.currentUserIsGlobalAdmin ||
          instanceState.currentUserPermissions.can_view_data ||
          instanceState.currentUserPermissions.can_configure_data;
        return (
          <div class="flex items-center justify-end">
            <Show when={canDownload}>
              <Button
                intent="base-100"
                size="sm"
                iconName="download"
                href={`${_SERVER_HOST}/${encodeURIComponent(asset.fileName)}`}
                download={asset.fileName}
              />
            </Show>
            <Show when={canDelete}>
              <Button
                iconName="trash"
                intent="base-100"
                size="sm"
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
        en: "No assets uploaded yet",
        fr: "Aucune ressource téléversée",
        pt: "Ainda não foram carregados recursos",
      })}
      bulkActions={bulkActions()}
      selectionLabel={t3({ en: "asset", fr: "ressource", pt: "recurso" })}
    />
  );
}
