import {
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FrameTop,
  HeadingBarMainRibbon,
  LockIcon,
  timActionDelete,
} from "panther";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { AssetInfo, t3 } from "lib";
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
  const [isPublicUpload, setIsPublicUpload] = createSignal(true);

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-file-button",
      maxNumberOfFiles: 0,
    });

    uppy.on("file-added", (file: any) => {
      uppy!.setFileMeta(file.id, {
        isPublic: isPublicUpload() ? "true" : "false",
      });
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
          <div class="flex items-center gap-2">
            <div class="flex rounded overflow-hidden border border-white/20 text-sm">
              <button
                class={`px-3 py-1 transition-colors ${isPublicUpload() ? "bg-primary text-primary-content" : "bg-base-200 text-base-content/60 hover:bg-base-200/80"}`}
                onClick={() => setIsPublicUpload(true)}
              >
                {t3({ en: "Public", fr: "Public" })}
              </button>
              <button
                class={`px-3 py-1 transition-colors ${!isPublicUpload() ? "bg-primary text-primary-content" : "bg-base-200 text-base-content/60 hover:bg-base-200/80"}`}
                onClick={() => setIsPublicUpload(false)}
              >
                {t3({ en: "Private", fr: "Privé" })}
              </button>
            </div>
            <Button id="select-file-button" iconName="upload">
              {t3({ en: "Upload", fr: "Téléverser" })}
            </Button>
          </div>
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

  const sharedAssets = createMemo(() =>
    p.assets.filter((a) => a.isPublic)
  );

  const privateAssets = createMemo(() =>
    p.assets.filter(
      (a) => !a.isPublic && a.uploaderEmail === p.currentUserEmail,
    )
  );

  return (
    <div class="flex flex-col gap-6">
      <AssetSection
        sectionId="shared"
        title={t3({ en: "Shared Assets", fr: "Ressources partagées" })}
        assets={sharedAssets()}
        showOwner={true}
        expandedFolders={expandedFolders()}
        onToggleFolder={toggleFolder}
        currentUserEmail={p.currentUserEmail}
        isAdmin={p.isAdmin}
        onDelete={p.onDelete}
        emptyMessage={t3({ en: "No shared assets", fr: "Aucune ressource partagée" })}
      />
      <AssetSection
        sectionId="private"
        title={t3({ en: "My Private Assets", fr: "Mes ressources privées" })}
        assets={privateAssets()}
        showOwner={false}
        expandedFolders={expandedFolders()}
        onToggleFolder={toggleFolder}
        currentUserEmail={p.currentUserEmail}
        isAdmin={p.isAdmin}
        onDelete={p.onDelete}
        emptyMessage={t3({ en: "No private assets", fr: "Aucune ressource privée" })}
      />
    </div>
  );
}

function AssetSection(p: {
  sectionId: string;
  title: string;
  assets: AssetInfo[];
  showOwner: boolean;
  expandedFolders: Set<string>;
  onToggleFolder: (key: string) => void;
  currentUserEmail: string;
  isAdmin: boolean;
  onDelete: (fileName: string) => void;
  emptyMessage: string;
}) {
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
    <div>
      <div class="flex items-center gap-2 mb-3">
        <Show when={p.sectionId === "private"}>
          <LockIcon class="w-3.5 h-3.5 text-neutral" />
        </Show>
        <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/80">
          {p.title}
        </h3>
        <span class="text-xs text-neutral">({p.assets.length})</span>
      </div>

      <Show
        when={p.assets.length > 0}
        fallback={
          <p class="text-sm text-neutral pl-2">{p.emptyMessage}</p>
        }
      >
        <div class="flex flex-col gap-1 border border-white/10 rounded-lg overflow-hidden">
          <For each={nonEmptyTypes()}>
            {(fileType) => {
              const files = () => grouped().get(fileType) ?? [];
              const folderKey = `${p.sectionId}-${fileType}`;
              const isExpanded = () => p.expandedFolders.has(folderKey);
              return (
                <AssetFolder
                  folderKey={folderKey}
                  label={t3(FILE_TYPE_LABELS[fileType])}
                  files={files()}
                  isExpanded={isExpanded()}
                  onToggle={() => p.onToggleFolder(folderKey)}
                  showOwner={p.showOwner}
                  currentUserEmail={p.currentUserEmail}
                  isAdmin={p.isAdmin}
                  onDelete={p.onDelete}
                />
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function AssetFolder(p: {
  folderKey: string;
  label: string;
  files: AssetInfo[];
  isExpanded: boolean;
  onToggle: () => void;
  showOwner: boolean;
  currentUserEmail: string;
  isAdmin: boolean;
  onDelete: (fileName: string) => void;
}) {
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
        <div class="bg-black/10">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/10 text-neutral text-xs">
                <th class="text-left px-4 py-1.5 font-medium">
                  {t3({ en: "Name", fr: "Nom" })}
                </th>
                <th class="text-left px-3 py-1.5 font-medium">
                  {t3({ en: "Size", fr: "Taille" })}
                </th>
                <th class="text-left px-3 py-1.5 font-medium">
                  {t3({ en: "Modified", fr: "Modifié" })}
                </th>
                <Show when={p.showOwner}>
                  <th class="text-left px-3 py-1.5 font-medium">
                    {t3({ en: "Owner", fr: "Propriétaire" })}
                  </th>
                </Show>
                <th class="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              <For each={p.files}>
                {(asset) => {
                  const canDelete =
                    p.isAdmin || asset.uploaderEmail === p.currentUserEmail;
                  return (
                    <tr class="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors">
                      <td class="px-4 py-2 font-mono text-sm text-base-content">
                        {asset.fileName}
                      </td>
                      <td class="px-3 py-2 text-neutral text-sm whitespace-nowrap">
                        {formatFileSize(asset.size)}
                      </td>
                      <td class="px-3 py-2 text-neutral text-sm whitespace-nowrap">
                        {formatDate(asset.lastModified)}
                      </td>
                      <Show when={p.showOwner}>
                        <td class="px-3 py-2 text-neutral text-sm">
                          <Show
                            when={asset.uploaderEmail}
                            fallback={
                              <span class="text-xs text-neutral/50 italic">
                                {t3({ en: "system", fr: "système" })}
                              </span>
                            }
                          >
                            <span class="font-mono text-xs">
                              {asset.uploaderEmail}
                            </span>
                          </Show>
                        </td>
                      </Show>
                      <td class="px-3 py-2">
                        <div class="flex items-center justify-end gap-1">
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
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
