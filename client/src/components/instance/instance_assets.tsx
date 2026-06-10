import {
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FrameTop,
  HeadingBarMainRibbon,
  Table,
  timActionDelete,
  type BulkAction,
  type TableColumn,
} from "panther";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { AssetInfo, t3, TC } from "lib";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions";
import { createUppyInstance, cleanupUppy } from "~/components/_uppy_file_upload";
import type Uppy from "@uppy/core";
import { instanceState, updateInstanceAssets } from "~/state/instance/t1_store";

type FileType = "csv" | "excel" | "image" | "zip" | "other";

const FILE_TYPE_LABELS: Record<FileType, { en: string; fr: string }> = {
  csv: { en: "CSV Files", fr: "Fichiers CSV" },
  excel: { en: "Excel Files", fr: "Fichiers Excel" },
  image: { en: "Images", fr: "Images" },
  zip: { en: "ZIP Files", fr: "Fichiers ZIP" },
  other: { en: "Other Files", fr: "Autres fichiers" },
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

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-file-button",
      maxNumberOfFiles: 0,
    });

    uppy.on("complete", () => {
      serverActions.getAssets({}).then((res) => {
        if (res.success) updateInstanceAssets(res.data);
      });
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  async function attemptDeleteAssetFile(assetFileName: string) {
    const deleteAction = timActionDelete(
      {
        text: t3({
          en: "Are you sure you want to delete this asset file?",
          fr: "Êtes-vous sûr de vouloir supprimer ce fichier ressource ?",
        }),
        itemList: [assetFileName],
      },
      () => serverActions.deleteAssets({ assetFileNames: [assetFileName] }),
    );
    await deleteAction.click();
    const res = await serverActions.getAssets({});
    if (res.success) updateInstanceAssets(res.data);
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBarMainRibbon heading={t3({ en: "Assets", fr: "Ressources" })}>
          <Button id="select-file-button" iconName="upload">
            {t3({ en: "Upload", fr: "Téléverser" })}
          </Button>
        </HeadingBarMainRibbon>
      }
    >
      <div class="ui-pad h-full w-full overflow-y-auto">
        <AssetFileSystem
          assets={instanceState.assets}
          currentUserEmail={instanceState.currentUserEmail}
          isAdmin={instanceState.currentUserIsGlobalAdmin}
          onDelete={attemptDeleteAssetFile}
        />
      </div>
    </FrameTop>
  );
}

function AssetFileSystem(p: {
  assets: AssetInfo[];
  currentUserEmail: string;
  isAdmin: boolean;
  onDelete: (fileName: string) => void;
}) {
  const [expandedFolders, setExpandedFolders] = createSignal(new Set<string>());

  function toggleFolder(key: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

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
    FILE_TYPE_ORDER.filter((t) => (grouped().get(t)?.length ?? 0) > 0)
  );

  return (
    <Show
      when={p.assets.length > 0}
      fallback={
        <p class="text-sm text-neutral pl-2">
          {t3({ en: "No assets uploaded yet", fr: "Aucune ressource téléversée" })}
        </p>
      }
    >
      <div class="flex flex-col gap-1 border border-white/10 rounded-lg overflow-hidden">
        <For each={nonEmptyTypes()}>
          {(fileType) => {
            const files = () => grouped().get(fileType) ?? [];
            const folderKey = fileType;
            const isExpanded = () => expandedFolders().has(folderKey);
            return (
              <AssetFolder
                label={t3(FILE_TYPE_LABELS[fileType])}
                files={files()}
                isExpanded={isExpanded()}
                onToggle={() => toggleFolder(folderKey)}
                currentUserEmail={p.currentUserEmail}
                isAdmin={p.isAdmin}
                onDelete={p.onDelete}
              />
            );
          }}
        </For>
      </div>
    </Show>
  );
}

function AssetFolder(p: {
  label: string;
  files: AssetInfo[];
  isExpanded: boolean;
  onToggle: () => void;
  currentUserEmail: string;
  isAdmin: boolean;
  onDelete: (fileName: string) => void;
}) {
  const columns = createMemo((): TableColumn<AssetInfo>[] => [
    {
      key: "fileName",
      header: t3({ en: "File Name", fr: "Nom du fichier" }),
      sortable: true,
      render: (asset) => (
        <span class="font-mono text-sm">{asset.fileName}</span>
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
        <span class="text-neutral text-sm">{formatDate(asset.lastModified)}</span>
      ),
    },
    {
      key: "uploaderEmail",
      header: t3({ en: "Owner", fr: "Propriétaire" }),
      sortable: true,
      render: (asset) => (
        <Show
          when={asset.uploaderEmail}
          fallback={
            <span class="text-neutral/50 italic text-sm">
              {t3({ en: "system", fr: "système" })}
            </span>
          }
        >
          <span class="font-mono text-sm">{asset.uploaderEmail}</span>
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
        return (
          <div class="ui-gap-sm flex items-center justify-end">
            <Button
              intent="base-100"
              iconName="download"
              href={`${_SERVER_HOST}/assets/${asset.fileName}`}
              download={asset.fileName}
            />
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
    const deleteAction = timActionDelete(
      {
        text:
          assetFileNames.length === 1
            ? t3({
                en: "Are you sure you want to delete this asset file?",
                fr: "Êtes-vous sûr de vouloir supprimer ce fichier ressource ?",
              })
            : t3({
                en: "Are you sure you want to delete these asset files?",
                fr: "Êtes-vous sûr de vouloir supprimer ces fichiers ressources ?",
              }),
        itemList: assetFileNames,
      },
      () => serverActions.deleteAssets({ assetFileNames }),
    );
    await deleteAction.click();
    const res = await serverActions.getAssets({});
    if (res.success) updateInstanceAssets(res.data);
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
    <div class="border-b border-white/10 last:border-b-0">
      <button
        class="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
        onClick={p.onToggle}
      >
        <Show
          when={p.isExpanded}
          fallback={<ChevronRightIcon class="w-3.5 h-3.5 text-neutral shrink-0" />}
        >
          <ChevronDownIcon class="w-3.5 h-3.5 text-neutral shrink-0" />
        </Show>
        <FolderIcon class="w-4 h-4 text-primary shrink-0" />
        <span class="text-sm font-medium text-base-content flex-1">
          {p.label}
        </span>
        <span class="text-xs text-neutral bg-white/10 rounded-full px-2 py-0.5">
          {p.files.length}
        </span>
      </button>

      <Show when={p.isExpanded}>
        <Table
          data={p.files}
          columns={columns()}
          keyField="fileName"
          defaultSort={{ key: "fileName", direction: "asc" }}
          noRowsMessage={t3({ en: "No assets", fr: "Aucune ressource" })}
          bulkActions={bulkActions()}
          selectionLabel={t3({ en: "asset", fr: "ressource" })}
        />
      </Show>
    </div>
  );
}
