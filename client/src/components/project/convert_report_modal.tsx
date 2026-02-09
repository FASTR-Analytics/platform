import { useNavigate } from "@solidjs/router";
import { t, type SlideDeckFolder } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  ProgressBar,
  Select,
  getProgress,
  timActionForm,
} from "panther";
import { createSignal, Show } from "solid-js";
import { convertReportToSlideDeck } from "./convert_report_to_slide_deck";

type Props = {
  projectId: string;
  reportId: string;
  reportLabel: string;
  folders: SlideDeckFolder[];
};

type ReturnType = { deckId: string } | undefined;

export function ConvertReportModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const navigate = useNavigate();
  const progress = getProgress();
  const [folderId, setFolderId] = createSignal<string>("_none");

  const folderOptions = () => [
    { value: "_none", label: t("General") },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const selectedFolderId = folderId() === "_none" ? null : folderId();
      return await convertReportToSlideDeck(
        p.projectId,
        p.reportId,
        progress.onProgress,
        selectedFolderId,
      );
    },
    (data) => {
      p.close(data);
      navigate(`/?p=${p.projectId}&d=${data.deckId}`);
    },
  );

  return (
    <AlertFormHolder
      formId="convert-report-to-slide-deck"
      header="Convert to Slide Deck"
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <div class="text-sm">
          Convert <span class="font-700">"{p.reportLabel}"</span> to a slide
          deck?
        </div>
        <Select
          label={t("Folder")}
          options={folderOptions()}
          value={folderId()}
          onChange={setFolderId}
          fullWidth
        />
        <Show when={save.state().status === "loading"}>
          <ProgressBar
            progressFrom0To100={progress.progressFrom0To100()}
            progressMsg={progress.progressMsg()}
            small
          />
        </Show>
      </div>
    </AlertFormHolder>
  );
}
