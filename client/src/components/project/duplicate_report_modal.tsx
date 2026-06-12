import { ReportFolder, t3, TC } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  ColorPicker,
  Input,
  Select,
  createFormAction,
  ProgressBar,
  getProgress,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";

export function DuplicateReportModal(
  p: AlertComponentProps<
    {
      projectId: string;
      reportDetails: Array<{
        id: string;
        label: string;
        folderId: string | null;
      }>;
      folders: ReportFolder[];
    },
    { lastUpdated: string } | undefined
  >,
) {
  const isBatchMode = () => p.reportDetails.length > 1;

  const [tempLabel, setTempLabel] = createSignal<string>(
    p.reportDetails.length === 1 ? p.reportDetails[0].label : "",
  );
  const [tempFolderId, setTempFolderId] = createSignal<string>(
    p.reportDetails.length === 1 && p.reportDetails[0].folderId
      ? p.reportDetails[0].folderId
      : "_none",
  );

  const [isCreatingFolder, setIsCreatingFolder] = createSignal(false);
  const [newFolderLabel, setNewFolderLabel] = createSignal("");
  const [newFolderColor, setNewFolderColor] = createSignal("#3b82f6");

  const progress = getProgress();

  const folderOptions = () => [
    { value: "_none", label: t3(TC.general) },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      let folderId: string | null;

      if (isCreatingFolder()) {
        const label = newFolderLabel().trim();
        if (!label) {
          return { success: false, err: t3({ en: "Folder name is required", fr: "Le nom du dossier est requis" }) };
        }

        const createRes = await serverActions.createReportFolder({
          projectId: p.projectId,
          label,
          color: newFolderColor(),
        });

        if (!createRes.success) {
          return createRes;
        }

        folderId = createRes.data.folderId;
      } else {
        folderId = tempFolderId() === "_none" ? null : tempFolderId();
      }

      const reportCount = p.reportDetails.length;

      if (reportCount === 1) {
        const label = tempLabel().trim();
        if (!label) {
          return { success: false, err: t3(TC.mustEnterName) };
        }

        return serverActions.duplicateReport({
          projectId: p.projectId,
          report_id: p.reportDetails[0].id,
          label,
          folderId,
        });
      } else {
        let successCount = 0;

        for (let i = 0; i < reportCount; i++) {
          const report = p.reportDetails[i];

          progress.onProgress(
            i / reportCount,
            `Duplicating report ${i + 1} of ${reportCount}...`,
          );

          const label = `${report.label} (copy)`;

          try {
            const dupRes = await serverActions.duplicateReport({
              projectId: p.projectId,
              report_id: report.id,
              label,
              folderId,
            });

            if (!dupRes.success) {
              return {
                success: false,
                err: `Failed on report ${i + 1} of ${reportCount} (${report.label}): ${dupRes.err}. Created ${successCount} duplicates successfully.`,
              };
            }
            successCount++;
          } catch (err) {
            return {
              success: false,
              err: `Failed on report ${i + 1} of ${reportCount} (${report.label}): ${err instanceof Error ? err.message : String(err)}. Created ${successCount} duplicates successfully.`,
            };
          }
        }

        progress.onProgress(1, `Duplicated ${reportCount} reports`);

        return {
          success: true,
          data: { lastUpdated: new Date().toISOString() },
        };
      }
    },
    (data) => {
      if (data) {
        p.close({ lastUpdated: data.lastUpdated });
      }
    },
  );

  const header =
    p.reportDetails.length > 1
      ? `${t3({ en: "Duplicate", fr: "Dupliquer" })} ${p.reportDetails.length} ${t3({ en: "reports", fr: "rapports" })}`
      : t3({ en: "Duplicate report", fr: "Dupliquer le rapport" });

  return (
    <AlertFormHolder
      formId="duplicate-report"
      header={header}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={
        isCreatingFolder()
          ? !newFolderLabel().trim()
          : !isBatchMode() && !tempLabel().trim()
      }
    >
      <div class="space-y-4">
        <Show when={isBatchMode() && save.state().status === "loading"}>
          <ProgressBar
            progressFrom0To100={progress.progressFrom0To100()}
            progressMsg={progress.progressMsg()}
            small
          />
        </Show>

        <Show when={!isBatchMode()}>
          <Input
            label={t3({ en: "New report name", fr: "Nom du nouveau rapport" })}
            value={tempLabel()}
            onChange={setTempLabel}
            fullWidth
            autoFocus
          />
        </Show>

        <Show
          when={!isCreatingFolder()}
          fallback={
            <div class="space-y-4">
              <div class="flex ui-gap">
                <Input
                  label={t3({ en: "Folder name", fr: "Nom du dossier" })}
                  value={newFolderLabel()}
                  onChange={setNewFolderLabel}
                  autoFocus
                  fullWidth
                />
                <ColorPicker
                  label={t3({ en: "Color", fr: "Couleur" })}
                  value={newFolderColor()}
                  onChange={(c) => setNewFolderColor(c)}
                  position="right"
                />
              </div>
              <Button
                size="sm"
                outline
                onClick={() => setIsCreatingFolder(false)}
              >
                {t3({ en: "Back to folder list", fr: "Retour à la liste des dossiers" })}
              </Button>
            </div>
          }
        >
          <div class="space-y-4">
            <Select
              label={t3(TC.folder)}
              options={folderOptions()}
              value={tempFolderId()}
              onChange={setTempFolderId}
              fullWidth
            />
            <Button
              size="sm"
              outline
              iconName="plus"
              onClick={() => setIsCreatingFolder(true)}
            >
              {t3({ en: "Create new folder", fr: "Créer un nouveau dossier" })}
            </Button>
          </div>
        </Show>
      </div>
    </AlertFormHolder>
  );
}
