import {
  Button,
  FrameTop,
  HeadingBarMainRibbon,
  StateHolderWrapper,
  TimQuery,
  timActionDelete,
  type BulkAction,
} from "panther";
import { Show, onCleanup, onMount, createMemo } from "solid-js";
import { AssetInfo, InstanceDetail, t3, TC } from "lib";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions/config";
import { createUppyInstance, cleanupUppy } from "~/upload/uppy_file_upload";
import type Uppy from "@uppy/core";
import { Table, TableColumn } from "panther";

type Props = {
  isGlobalAdmin: boolean;
  instanceDetail: TimQuery<InstanceDetail>;
};

export function InstanceAssets(p: Props) {
  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-file-button",
      onModalClosed: () => {
        p.instanceDetail.fetch();
      },
      maxNumberOfFiles: 0, // No limit on number of files
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  // Actions

  async function attemptDeleteAssetFile(assetFileName: string) {
    const deleteAction = timActionDelete(
      {
        text: t3({ en: "Are you sure you want to delete this asset file?", fr: "Êtes-vous sûr de vouloir supprimer ce fichier ressource ?" }),
        itemList: [assetFileName],
      },
      () => serverActions.deleteAssets({ assetFileNames: [assetFileName] }),
      p.instanceDetail.silentFetch,
    );

    await deleteAction.click();
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBarMainRibbon heading={t3({ en: "Assets", fr: "Ressources" })}>
          <Show when={p.isGlobalAdmin}>
            <Button id="select-file-button" iconName="upload">
              {t3({ en: "Upload assets", fr: "Téléverser des ressources" })}
            </Button>
          </Show>
        </HeadingBarMainRibbon>
      }
    >
      <StateHolderWrapper state={p.instanceDetail.state()}>
        {(keyedInstanceDetail) => {
          return (
            <div class="ui-pad h-full w-full">
              <AssetTable
                assets={keyedInstanceDetail.assets}
                isGlobalAdmin={p.isGlobalAdmin}
                onDelete={attemptDeleteAssetFile}
                silentFetch={p.instanceDetail.silentFetch}
              />
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}

type AssetWithType = AssetInfo & { fileType: string };

function AssetTable(p: {
  assets: AssetInfo[];
  isGlobalAdmin: boolean;
  onDelete: (fileName: string) => void;
  silentFetch: () => Promise<void>;
}) {
  function getFileType(asset: AssetInfo): string {
    if (asset.isCsv) return "CSV";
    if (asset.isImage) return t3({ en: "Image", fr: "Image" });
    return t3({ en: "Other", fr: "Autre" });
  }

  // Transform assets to include fileType for sorting
  const assetsWithType = createMemo(() =>
    p.assets.map((asset) => ({
      ...asset,
      fileType: getFileType(asset),
    })),
  );

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }

  // Bulk delete assets
  async function handleBulkDeleteAssets(selectedAssets: AssetWithType[]) {
    const assetFileNames = selectedAssets.map((asset) => asset.fileName);
    const assetCount = assetFileNames.length;

    const deleteAction = timActionDelete(
      {
        text: assetCount === 1
          ? t3({ en: "Are you sure you want to delete this asset file?", fr: "Êtes-vous sûr de vouloir supprimer ce fichier ressource ?" })
          : t3({ en: "Are you sure you want to delete these asset files?", fr: "Êtes-vous sûr de vouloir supprimer ces fichiers ressources ?" }),
        itemList: assetFileNames,
      },
      () => serverActions.deleteAssets({ assetFileNames }),
      p.silentFetch,
    );

    await deleteAction.click();
  }

  const columns: TableColumn<AssetWithType>[] = [
    {
      key: "fileName",
      header: t3({ en: "File Name", fr: "Nom du fichier" }),
      sortable: true,
      render: (asset) => (
        <span class="font-mono text-sm">{asset.fileName}</span>
      ),
    },
    {
      key: "fileType",
      header: t3({ en: "Type", fr: "Type" }),
      sortable: true,
      render: (asset) => (
        <span class="text-neutral text-sm">{asset.fileType}</span>
      ),
    },
    {
      key: "size",
      header: t3({ en: "Size", fr: "Taille" }),
      sortable: true,
      render: (asset) => (
        <span class="text-neutral text-sm">{formatFileSize(asset.size)}</span>
      ),
    },
    {
      key: "lastModified",
      header: t3({ en: "Modified", fr: "Modifié" }),
      sortable: true,
      render: (asset) => (
        <span class="text-neutral text-sm">
          {formatDate(asset.lastModified)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (asset) => (
        <div class="ui-gap-sm flex items-center justify-end">
          <Button
            intent="base-100"
            iconName="download"
            href={`${_SERVER_HOST}/${asset.fileName}`}
            download={asset.fileName}
          />
          <Show when={p.isGlobalAdmin}>
            <Button
              iconName="trash"
              intent="base-100"
              onClick={(e) => {
                e.stopPropagation();
                p.onDelete(asset.fileName);
              }}
            />
          </Show>
        </div>
      ),
    },
  ];

  // Bulk actions (only if admin)
  const bulkActions: BulkAction<AssetWithType>[] = p.isGlobalAdmin
    ? [
        {
          label: t3(TC.delete),
          intent: "danger",
          outline: true,
          onClick: handleBulkDeleteAssets,
        },
      ]
    : [];

  return (
    <Table
      data={assetsWithType()}
      defaultSort={{ key: "fileName", direction: "asc" }}
      columns={columns}
      keyField="fileName"
      noRowsMessage={t3({ en: "No assets", fr: "Aucune ressource" })}
      bulkActions={bulkActions}
      selectionLabel={t3({ en: "asset", fr: "ressource" })}
      fitTableToAvailableHeight
    />
  );
}
