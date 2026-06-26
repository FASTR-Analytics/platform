import {
  Button,
  FrameTop,
  HeadingBarMainRibbon,
  Table,
  TabsNavigation,
  createDeleteAction,
  type BulkAction,
  type ListItem,
  type TableColumn,
} from "panther";
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { AssetInfo, t3, TC } from "lib";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions";
import {
  createUppyInstance,
  cleanupUppy,
} from "~/components/_uppy_file_upload";
import type Uppy from "@uppy/core";
import { instanceState, updateInstanceAssets } from "~/state/instance/t1_store";

type FileType = "csv" | "excel" | "image" | "zip" | "other";

const FILE_TYPE_LABELS: Record<FileType, { en: string; fr: string; pt: string }> = {
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
    const res = await serverActions.getAssets({});
    if (res.success) updateInstanceAssets(res.data);
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBarMainRibbon heading={t3({ en: "Assets", fr: "Ressources", pt: "Recursos" })}>
          <Button id="select-file-button" iconName="upload">
            {t3({ en: "Upload", fr: "Téléverser", pt: "Carregar" })}
          </Button>
        </HeadingBarMainRibbon>
      }
    >
      <AssetFileSystem
        assets={instanceState.assets}
        currentUserEmail={instanceState.currentUserEmail}
        isAdmin={instanceState.currentUserIsGlobalAdmin}
        onDelete={attemptDeleteAssetFile}
      />
    </FrameTop>
  );
}

function AssetFileSystem(p: {
  assets: AssetInfo[];
  currentUserEmail: string;
  isAdmin: boolean;
  onDelete: (fileName: string) => void;
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
      iconName: "folder",
      badge: grouped().get(type)?.length ?? 0,
    })),
  );

  return (
    <Show
      when={activeType()}
      fallback={
        <p class="text-neutral ui-pad text-sm">
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
              items={tabItems()}
              value={active()}
              onChange={setSelectedType}
            />
          }
        >
          <div class="ui-pad h-full w-full overflow-auto">
            <AssetTable
              files={grouped().get(active()) ?? []}
              currentUserEmail={p.currentUserEmail}
              isAdmin={p.isAdmin}
              onDelete={p.onDelete}
            />
          </div>
        </FrameTop>
      )}
    </Show>
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
      header: t3({ en: "File Name", fr: "Nom du fichier", pt: "Nome do ficheiro" }),
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
        <span class="text-neutral text-sm">{formatFileSize(asset.size)}</span>
      ),
    },
    {
      key: "lastModified",
      header: t3({ en: "Modified", fr: "Modifié", pt: "Modificado" }),
      sortable: true,
      render: (asset) => (
        <span class="text-neutral text-sm">
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
            <span class="text-neutral/50 text-sm italic">
              {t3({ en: "system", fr: "système", pt: "sistema" })}
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
    <Table
      data={p.files}
      columns={columns()}
      keyField="fileName"
      defaultSort={{ key: "fileName", direction: "asc" }}
      noRowsMessage={t3({ en: "No assets", fr: "Aucune ressource", pt: "Sem recursos" })}
      bulkActions={bulkActions()}
      selectionLabel={t3({ en: "asset", fr: "ressource", pt: "recurso" })}
    />
  );
}
