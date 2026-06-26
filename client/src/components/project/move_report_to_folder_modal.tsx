import { ReportFolder, t3, TC } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  ColorPicker,
  Input,
  RadioGroup,
  createFormAction,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  reportIds: string[];
  currentFolderId: string | null;
  folders: ReportFolder[];
};

type ReturnType = { lastUpdated: string } | undefined;

export function MoveReportToFolderModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const [selectedFolderId, setSelectedFolderId] = createSignal<string | null>(
    p.currentFolderId,
  );
  const [isCreatingFolder, setIsCreatingFolder] = createSignal(false);
  const [newFolderLabel, setNewFolderLabel] = createSignal("");
  const [newFolderColor, setNewFolderColor] = createSignal("#3b82f6");

  const folderOptions = () => [
    { value: "_none", label: t3(TC.general) },
    ...p.folders.map((f) => ({
      value: f.id,
      label: f.label,
    })),
  ];

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      if (isCreatingFolder()) {
        const label = newFolderLabel().trim();
        if (!label) {
          return { success: false, err: t3({ en: "Folder name is required", fr: "Le nom du dossier est requis", pt: "O nome da pasta é obrigatório" }) };
        }

        const createRes = await serverActions.createReportFolder({
          projectId: p.projectId,
          label,
          color: newFolderColor(),
        });

        if (!createRes.success) {
          return createRes;
        }

        const promises = p.reportIds.map((id) =>
          serverActions.moveReportToFolder({
            projectId: p.projectId,
            report_id: id,
            folderId: createRes.data.folderId,
          }),
        );
        const results = await Promise.all(promises);
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          return failed[0];
        }
        return results[0];
      }

      const folderId =
        selectedFolderId() === "_none" ? null : selectedFolderId();

      if (folderId === p.currentFolderId) {
        p.close(undefined);
        return { success: true, data: { lastUpdated: "" } };
      }

      const promises = p.reportIds.map((id) =>
        serverActions.moveReportToFolder({
          projectId: p.projectId,
          report_id: id,
          folderId,
        }),
      );
      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        return failed[0];
      }
      return results[0];
    },
    (data) => {
      p.close({ lastUpdated: data.lastUpdated });
    },
  );

  const header =
    p.reportIds.length > 1
      ? `${t3({ en: "Move", fr: "Déplacer", pt: "Mover" })} ${p.reportIds.length} ${t3({ en: "reports to folder", fr: "rapports vers le dossier", pt: "relatórios para a pasta" })}`
      : t3({ en: "Move to folder", fr: "Déplacer vers le dossier", pt: "Mover para a pasta" });

  return (
    <AlertFormHolder
      formId="move-report-to-folder"
      header={header}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={isCreatingFolder() && !newFolderLabel().trim()}
    >
      <Show
        when={!isCreatingFolder()}
        fallback={
          <div class="space-y-4">
            <div class="flex ui-gap">
              <Input
                label={t3({ en: "Folder name", fr: "Nom du dossier", pt: "Nome da pasta" })}
                value={newFolderLabel()}
                onChange={setNewFolderLabel}
                autoFocus
                fullWidth
              />
              <ColorPicker
                label={t3({ en: "Color", fr: "Couleur", pt: "Cor" })}
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
              {t3({ en: "Back to folder list", fr: "Retour à la liste des dossiers", pt: "Voltar à lista de pastas" })}
            </Button>
          </div>
        }
      >
        <div class="space-y-4">
          <RadioGroup
            label={t3({ en: "Select folder", fr: "Sélectionner le dossier", pt: "Selecionar a pasta" })}
            options={folderOptions()}
            value={selectedFolderId() ?? "_none"}
            onChange={(v) => setSelectedFolderId(v === "_none" ? null : v)}
            convertToSelectThreshold={6}
            fullWidthForSelect
          />
          <Button
            size="sm"
            outline
            iconName="plus"
            onClick={() => setIsCreatingFolder(true)}
          >
            {t3({ en: "Create new folder", fr: "Créer un nouveau dossier", pt: "Criar nova pasta" })}
          </Button>
        </div>
      </Show>
    </AlertFormHolder>
  );
}
