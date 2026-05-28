import { createSignal } from "solid-js";
import { t3, TC } from "lib";
import {
  Button,
  type EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  pickFileAsArrayBuffer,
  RadioGroup,
  StateHolderFormError,
  timActionForm,
} from "panther";
import { serverActions } from "~/server_actions";
import { parseHfaWorkbook } from "./_xlsx_workbook";

type Props = EditorComponentProps<{ timePoints: string[] }, undefined>;

export function HfaIndicatorsXlsxUploadForm(p: Props) {
  const [uploadMode, setUploadMode] = createSignal<"replace" | "add">("add");
  const [fileName, setFileName] = createSignal<string>("");
  const [arrayBuffer, setArrayBuffer] = createSignal<ArrayBuffer | undefined>(
    undefined,
  );

  async function pickFile() {
    const buf = await pickFileAsArrayBuffer([".xlsx"]);
    if (!buf) return;
    setArrayBuffer(buf);
    setFileName("workbook.xlsx");
  }

  const handleImport = timActionForm(
    async () => {
      const buf = arrayBuffer();
      if (!buf) {
        return {
          success: false,
          err: t3({ en: "You must select an XLSX file", fr: "Vous devez sélectionner un fichier XLSX" }),
        };
      }
      const parsed = parseHfaWorkbook(buf, p.timePoints);
      if (!parsed.ok) {
        return { success: false, err: parsed.err };
      }
      return await serverActions.importHfaIndicatorsWorkbook({
        ...parsed.data,
        replaceAll: uploadMode() === "replace",
      });
    },
    () => p.close(undefined),
  );

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={t3({
            en: "Import HFA Indicators from Excel",
            fr: "Importer des indicateurs HFA depuis Excel",
          })}
          back={() => p.close(undefined)}
        />
      }
    >
      <div class="ui-pad ui-spy max-w-3xl">
        <div class="text-sm">
          {t3({
            en: "Upload an Excel workbook (.xlsx) with three sheets:",
            fr: "Téléversez un classeur Excel (.xlsx) comportant trois feuilles :",
          })}
          <ul class="mt-2 ml-5 list-disc space-y-1">
            <li>
              <span class="font-mono font-700">Categories</span>: id, label
            </li>
            <li>
              <span class="font-mono font-700">Sub-categories</span>: id,
              categoryId, label
            </li>
            <li>
              <span class="font-mono font-700">Indicators</span>: varName,
              categoryId, subCategoryId, shortLabel, definition, type,
              aggregation, r_code_1, r_filter_code_1, …
            </li>
          </ul>
          <div class="mt-2 text-xs opacity-60">
            {t3({
              en: "Row order in each sheet defines display order. On Indicators, categoryId/subCategoryId are optional and must reference rows in the Categories/Sub-categories sheets. Download the current workbook to see the exact format.",
              fr: "L'ordre des lignes de chaque feuille définit l'ordre d'affichage. Sur Indicators, categoryId/subCategoryId sont facultatifs et doivent référencer des lignes des feuilles Categories/Sub-categories. Téléchargez le classeur actuel pour voir le format exact.",
            })}
          </div>
        </div>

        <RadioGroup
          label={t3({ en: "Import Mode", fr: "Mode d'importation" })}
          options={[
            { value: "add", label: t3({ en: "Add to existing", fr: "Ajouter aux existants" }) },
            { value: "replace", label: t3({ en: "Replace all existing", fr: "Remplacer tous les existants" }) },
          ]}
          value={uploadMode()}
          onChange={(val) => setUploadMode(val as "replace" | "add")}
        />

        <div>
          <Button onClick={pickFile} iconName="upload" intent="neutral">
            {t3({ en: "Select XLSX file", fr: "Sélectionner un fichier XLSX" })}
          </Button>
          {fileName() && (
            <div class="mt-2 text-sm">
              {t3({ en: "Selected file ready to import", fr: "Fichier sélectionné prêt à importer" })}
            </div>
          )}
        </div>

        <StateHolderFormError state={handleImport.state()} />

        <div class="ui-gap-sm flex">
          <Button
            onClick={handleImport.click}
            intent="primary"
            state={handleImport.state()}
            disabled={!arrayBuffer()}
            iconName="upload"
          >
            {t3({ en: "Import workbook", fr: "Importer le classeur" })}
          </Button>
          <Button onClick={() => p.close(undefined)} intent="neutral">
            {t3(TC.cancel)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
