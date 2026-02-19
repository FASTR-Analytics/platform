import type Uppy from "@uppy/core";
import { createSignal, onCleanup, onMount } from "solid-js";
import { t3, TC, type HfaIndicator } from "lib";
import {
  Button,
  Select,
  StateHolderFormError,
  StateHolderWrapper,
  getSelectOptions,
  timActionForm,
  timQuery,
  type EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  RadioGroup,
} from "panther";
import { cleanupUppy, createUppyInstance } from "~/upload/uppy_file_upload";
import { serverActions } from "~/server_actions";

type Props = EditorComponentProps<
  {
    onUploadComplete: (indicators: HfaIndicator[], replaceAll: boolean) => void;
  },
  undefined
>;

export function HfaCsvUploadForm(p: Props) {
  const [selectedFileName, setSelectedFileName] = createSignal<string>("");
  const [uploadMode, setUploadMode] = createSignal<"replace" | "add">("add");

  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t3({ en: "Loading assets...", fr: "Chargement des fichiers..." }),
  );

  function updateSelectedFileName(fileName: string) {
    setSelectedFileName(fileName);
  }

  const handleCsvUpload = timActionForm(
    async () => {
      const assetFileName = selectedFileName();

      if (!assetFileName) {
        return {
          success: false,
          err: t3({
            en: "You must select a CSV file",
            fr: "Vous devez sélectionner un fichier CSV",
          }),
        };
      }

      // Fetch the CSV file content
      const fileRes = await fetch(`/assets/${assetFileName}`);
      if (!fileRes.ok) {
        return {
          success: false,
          err: t3({
            en: "Failed to fetch CSV file",
            fr: "Échec du téléchargement du fichier CSV",
          }),
        };
      }

      const csvText = await fileRes.text();

      // Parse CSV
      const lines = csvText.trim().split("\n");
      if (lines.length < 2) {
        return {
          success: false,
          err: t3({
            en: "CSV file is empty or invalid",
            fr: "Le fichier CSV est vide ou invalide",
          }),
        };
      }

      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

      // Validate headers
      const requiredHeaders = ["category", "definition", "varName", "rCode", "type"];
      const optionalHeaders = ["rFilterCode"];
      const validHeaders = [...requiredHeaders, ...optionalHeaders];

      for (const header of requiredHeaders) {
        if (!headers.includes(header)) {
          return {
            success: false,
            err: t3({
              en: `Missing required header: ${header}`,
              fr: `En-tête requis manquant : ${header}`,
            }),
          };
        }
      }

      // Parse rows
      const indicators: HfaIndicator[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Simple CSV parsing (handles quoted fields)
        const values: string[] = [];
        let currentValue = "";
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          const nextChar = line[j + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              currentValue += '"';
              j++; // Skip next quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === "," && !inQuotes) {
            values.push(currentValue.trim());
            currentValue = "";
          } else {
            currentValue += char;
          }
        }
        values.push(currentValue.trim()); // Push last value

        if (values.length !== headers.length) {
          return {
            success: false,
            err: t3({
              en: `Row ${i} has ${values.length} columns but expected ${headers.length}`,
              fr: `La ligne ${i} a ${values.length} colonnes mais ${headers.length} attendues`,
            }),
          };
        }

        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx].replace(/^"|"$/g, "");
        });

        // Validate type
        if (row.type !== "binary" && row.type !== "numeric") {
          return {
            success: false,
            err: t3({
              en: `Row ${i}: type must be "binary" or "numeric"`,
              fr: `Ligne ${i} : le type doit être "binary" ou "numeric"`,
            }),
          };
        }

        const indicator: HfaIndicator = {
          category: row.category,
          definition: row.definition,
          varName: row.varName,
          rCode: row.rCode,
          type: row.type as "binary" | "numeric",
          ...(row.rFilterCode && { rFilterCode: row.rFilterCode }),
        };

        indicators.push(indicator);
      }

      if (indicators.length === 0) {
        return {
          success: false,
          err: t3({
            en: "No valid indicators found in CSV",
            fr: "Aucun indicateur valide trouvé dans le CSV",
          }),
        };
      }

      return { success: true };
    },
    async () => {
      // After successful validation, trigger callback with parsed data
      const fileRes = await fetch(`/assets/${selectedFileName()}`);
      const csvText = await fileRes.text();
      const lines = csvText.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

      const indicators: HfaIndicator[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values: string[] = [];
        let currentValue = "";
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          const nextChar = line[j + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              currentValue += '"';
              j++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === "," && !inQuotes) {
            values.push(currentValue.trim());
            currentValue = "";
          } else {
            currentValue += char;
          }
        }
        values.push(currentValue.trim());

        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx].replace(/^"|"$/g, "");
        });

        const indicator: HfaIndicator = {
          category: row.category,
          definition: row.definition,
          varName: row.varName,
          rCode: row.rCode,
          type: row.type as "binary" | "numeric",
          ...(row.rFilterCode && { rFilterCode: row.rFilterCode }),
        };

        indicators.push(indicator);
      }

      p.onUploadComplete(indicators, uploadMode() === "replace");
      p.close(undefined);
    },
  );

  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-hfa-csv-file-button",
      onModalClosed: () => {
        assetListing.fetch();
      },
      onUploadSuccess: (file) => {
        if (!file) {
          return;
        }
        updateSelectedFileName(file.name as string);
      },
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={t3({
            en: "Upload HFA Indicators from CSV",
            fr: "Téléverser des indicateurs HFA depuis CSV",
          })}
          back={() => p.close(undefined)}
        />
      }
    >
      <div class="ui-pad ui-spy">
        <div class="text-sm">
          {t3({
            en: "Upload a CSV file with the following headers:",
            fr: "Téléversez un fichier CSV avec les en-têtes suivants :",
          })}
          <div class="font-700 ml-3 mt-2 font-mono">
            category, definition, varName, rCode, type, rFilterCode
          </div>
          <div class="mt-2 text-xs opacity-60">
            {t3({
              en: 'Note: "type" must be "binary" or "numeric". "rFilterCode" is optional.',
              fr: 'Remarque : "type" doit être "binary" ou "numeric". "rFilterCode" est optionnel.',
            })}
          </div>
        </div>

        <RadioGroup
          label={t3({ en: "Upload Mode", fr: "Mode de téléversement" })}
          options={[
            { value: "add", label: t3({ en: "Add to existing", fr: "Ajouter aux existants" }) },
            { value: "replace", label: t3({ en: "Replace all existing", fr: "Remplacer tous les existants" }) },
          ]}
          value={uploadMode()}
          onChange={(val) => setUploadMode(val as "replace" | "add")}
        />

        <div class="">
          <Button id="select-hfa-csv-file-button" iconName="upload">
            {t3({
              en: "Upload new CSV file",
              fr: "Téléverser un nouveau fichier CSV",
            })}
          </Button>
        </div>

        <div class="w-96">
          <StateHolderWrapper state={assetListing.state()} noPad>
            {(keyedAssets) => {
              return (
                <Select
                  label={t3({
                    en: "Or select existing CSV file",
                    fr: "Ou sélectionner un fichier CSV existant",
                  })}
                  options={getSelectOptions(
                    keyedAssets.filter((a) => a.isCsv).map((a) => a.fileName),
                  )}
                  value={selectedFileName()}
                  onChange={updateSelectedFileName}
                  fullWidth
                />
              );
            }}
          </StateHolderWrapper>
        </div>

        <StateHolderFormError state={handleCsvUpload.state()} />

        <div class="ui-gap-sm flex">
          <Button
            onClick={handleCsvUpload.click}
            intent="primary"
            state={handleCsvUpload.state()}
            disabled={!selectedFileName()}
            iconName="upload"
          >
            {t3({ en: "Process CSV", fr: "Traiter le CSV" })}
          </Button>
          <Button onClick={() => p.close(undefined)} intent="neutral">
            {t3(TC.cancel)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
