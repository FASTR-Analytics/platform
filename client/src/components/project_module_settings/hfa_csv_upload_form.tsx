import { createSignal } from "solid-js";
import { t3, TC, type HfaIndicator } from "lib";
import {
  Button,
  StateHolderFormError,
  type EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  RadioGroup,
  timActionForm,
} from "panther";
import Papa from "papaparse";

type Props = EditorComponentProps<
  {
    onUploadComplete: (indicators: HfaIndicator[], replaceAll: boolean) => void;
  },
  undefined
>;

export function HfaCsvUploadForm(p: Props) {
  const [uploadMode, setUploadMode] = createSignal<"replace" | "add">("add");
  const [selectedFile, setSelectedFile] = createSignal<File | undefined>(
    undefined,
  );
  let fileInputRef: HTMLInputElement | undefined;

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    setSelectedFile(file);
  }

  const handleCsvUpload = timActionForm(
    async () => {
      const file = selectedFile();
      if (!file) {
        return {
          success: false,
          err: t3({
            en: "You must select a CSV file",
            fr: "Vous devez sélectionner un fichier CSV",
          }),
        };
      }

      // Read file content
      const csvText = await file.text();

      // Parse CSV using PapaParse
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (header: string) => header.trim(),
      });

      if (parseResult.errors && parseResult.errors.length > 0) {
        const errorMessages = parseResult.errors
          .map((e) => e.message || e.code)
          .join(", ");
        const firstLine = csvText.split("\n")[0];
        return {
          success: false,
          err: t3({
            en: `CSV parsing failed: ${errorMessages}\n\nFirst line of file:\n${firstLine}`,
            fr: `Échec de l'analyse du CSV : ${errorMessages}\n\nPremière ligne du fichier :\n${firstLine}`,
          }),
        };
      }

      const rows = parseResult.data as Record<string, string>[];

      if (rows.length === 0) {
        return {
          success: false,
          err: t3({
            en: "CSV file is empty",
            fr: "Le fichier CSV est vide",
          }),
        };
      }

      // Validate headers
      const requiredHeaders = [
        "category",
        "definition",
        "varName",
        "rCode",
        "type",
      ];
      const headers = Object.keys(rows[0]);

      for (const header of requiredHeaders) {
        if (!headers.includes(header)) {
          return {
            success: false,
            err: t3({
              en: `Missing required header: ${header}. Found headers: ${headers.join(", ")}`,
              fr: `En-tête requis manquant : ${header}. En-têtes trouvés : ${headers.join(", ")}`,
            }),
          };
        }
      }

      // Validate and convert rows to indicators
      const indicators: HfaIndicator[] = [];
      const usedVarNames = new Set<string>();
      let autoVarCounter = 1;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Normalize type: Boolean→binary, Numeric→numeric
        const typeLower = row.type?.toLowerCase().trim();
        let normalizedType: "binary" | "numeric";
        if (typeLower === "boolean" || typeLower === "binary") {
          normalizedType = "binary";
        } else if (typeLower === "numeric") {
          normalizedType = "numeric";
        } else {
          return {
            success: false,
            err: t3({
              en: `Row ${i + 2}: type must be "binary"/"Boolean" or "numeric"/"Numeric", got "${row.type}"`,
              fr: `Ligne ${i + 2} : le type doit être "binary"/"Boolean" ou "numeric"/"Numeric", reçu "${row.type}"`,
            }),
          };
        }

        // Auto-generate varName if empty
        let varName = row.varName?.trim() || "";
        if (!varName) {
          while (usedVarNames.has(`ind${String(autoVarCounter).padStart(3, "0")}`)) {
            autoVarCounter++;
          }
          varName = `ind${String(autoVarCounter).padStart(3, "0")}`;
          autoVarCounter++;
        }
        usedVarNames.add(varName);

        const indicator: HfaIndicator = {
          category: row.category || "",
          definition: row.definition || "",
          varName,
          rCode: row.rCode || "",
          type: normalizedType,
          ...(row.rFilterCode &&
            row.rFilterCode.trim() && { rFilterCode: row.rFilterCode }),
        };

        indicators.push(indicator);
      }

      // Success - pass indicators to callback
      p.onUploadComplete(indicators, uploadMode() === "replace");
      p.close(undefined);
      return { success: true };
    },
    async () => {
      // No-op success callback
    },
  );

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
          <div class="font-700 mt-2 ml-3 font-mono">
            category, definition, varName, rCode, type, rFilterCode
          </div>
          <div class="mt-2 text-xs opacity-60">
            {t3({
              en: 'Note: "type" can be "binary"/"Boolean" or "numeric"/"Numeric". "rFilterCode" is optional.',
              fr: 'Remarque : "type" peut être "binary"/"Boolean" ou "numeric"/"Numeric". "rFilterCode" est optionnel.',
            })}
          </div>
        </div>

        <RadioGroup
          label={t3({ en: "Upload Mode", fr: "Mode de téléversement" })}
          options={[
            {
              value: "add",
              label: t3({ en: "Add to existing", fr: "Ajouter aux existants" }),
            },
            {
              value: "replace",
              label: t3({
                en: "Replace all existing",
                fr: "Remplacer tous les existants",
              }),
            },
          ]}
          value={uploadMode()}
          onChange={(val) => setUploadMode(val as "replace" | "add")}
        />

        <div class="">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <Button
            onClick={() => fileInputRef?.click()}
            iconName="upload"
            intent="neutral"
          >
            {t3({
              en: "Select CSV file",
              fr: "Sélectionner un fichier CSV",
            })}
          </Button>
          {selectedFile() && (
            <div class="mt-2 text-sm">
              {t3({ en: "Selected:", fr: "Sélectionné :" })}{" "}
              <span class="font-600">{selectedFile()!.name}</span>
            </div>
          )}
        </div>

        <StateHolderFormError state={handleCsvUpload.state()} />

        <div class="ui-gap-sm flex">
          <Button
            onClick={handleCsvUpload.click}
            intent="primary"
            state={handleCsvUpload.state()}
            disabled={!selectedFile()}
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
