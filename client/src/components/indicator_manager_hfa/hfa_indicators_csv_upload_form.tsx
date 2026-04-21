import { createSignal } from "solid-js";
import {
  t3,
  TC,
  type HfaDictionaryForValidation,
  type HfaIndicator,
  type HfaIndicatorCode,
} from "lib";
import {
  Button,
  parseCSVToObjects,
  StateHolderFormError,
  type EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  RadioGroup,
  timActionForm,
} from "panther";
import { serverActions } from "~/server_actions";
import { validateRCode } from "./hfa_r_code_validator";

type Props = EditorComponentProps<
  { dictionary: HfaDictionaryForValidation },
  undefined
>;

export function HfaIndicatorsCsvUploadForm(p: Props) {
  const [uploadMode, setUploadMode] = createSignal<"replace" | "add">("add");
  const [selectedFile, setSelectedFile] = createSignal<File | undefined>(undefined);
  let fileInputRef: HTMLInputElement | undefined;

  const sortedTimePoints = [...p.dictionary.timePoints].sort((a, b) =>
    a.timePoint.localeCompare(b.timePoint),
  );

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    setSelectedFile(file);
  }

  const handleCsvUpload = timActionForm(
    async () => {
      const file = selectedFile();
      if (!file) {
        return { success: false, err: t3({ en: "You must select a CSV file", fr: "Vous devez sélectionner un fichier CSV" }) };
      }

      const csvText = await file.text();

      let rows: Record<string, string>[];
      try {
        rows = parseCSVToObjects(csvText);
      } catch (e) {
        const firstLine = csvText.split("\n")[0];
        return {
          success: false,
          err: t3({
            en: `CSV parsing failed: ${e instanceof Error ? e.message : String(e)}\n\nFirst line of file:\n${firstLine}`,
            fr: `Échec de l'analyse du CSV : ${e instanceof Error ? e.message : String(e)}\n\nPremière ligne du fichier :\n${firstLine}`,
          }),
        };
      }

      if (rows.length === 0) {
        return { success: false, err: t3({ en: "CSV file is empty", fr: "Le fichier CSV est vide" }) };
      }

      const requiredHeaders = ["varName", "category", "definition", "type", "aggregation"];
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

      const indicators: HfaIndicator[] = [];
      const code: HfaIndicatorCode[] = [];
      const usedVarNames = new Set<string>();
      let autoVarCounter = 1;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

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

        const aggLower = row.aggregation?.toLowerCase().trim();
        let normalizedAgg: "sum" | "avg";
        if (aggLower === "sum") {
          normalizedAgg = "sum";
        } else if (aggLower === "avg" || aggLower === "average" || aggLower === "mean") {
          normalizedAgg = "avg";
        } else {
          return {
            success: false,
            err: t3({
              en: `Row ${i + 2}: aggregation must be "sum" or "avg", got "${row.aggregation}"`,
              fr: `Ligne ${i + 2} : l'agrégation doit être "sum" ou "avg", reçu "${row.aggregation}"`,
            }),
          };
        }

        let varName = row.varName?.trim() || "";
        if (!varName) {
          while (usedVarNames.has(`ind${String(autoVarCounter).padStart(3, "0")}`)) {
            autoVarCounter++;
          }
          varName = `ind${String(autoVarCounter).padStart(3, "0")}`;
          autoVarCounter++;
        }
        if (usedVarNames.has(varName)) {
          return {
            success: false,
            err: t3({
              en: `Row ${i + 2}: duplicate varName "${varName}"`,
              fr: `Ligne ${i + 2} : varName en double "${varName}"`,
            }),
          };
        }
        usedVarNames.add(varName);

        const indicatorCode: { timePoint: string; rCode: string; rFilterCode: string }[] = [];
        for (let k = 0; k < sortedTimePoints.length; k++) {
          const tp = sortedTimePoints[k];
          const rCode = row[`r_code_${k + 1}`] ?? "";
          const rFilterCode = row[`r_filter_code_${k + 1}`] ?? "";
          indicatorCode.push({ timePoint: tp.timePoint, rCode, rFilterCode });
          if (!rCode.trim() && !rFilterCode.trim()) continue;
          code.push({
            varName,
            timePoint: tp.timePoint,
            rCode: rCode,
            rFilterCode: rFilterCode.trim() ? rFilterCode : undefined,
          });
        }

        // Compute validation for this indicator
        let hasSyntaxError = false;
        const otherVarNames = new Set(usedVarNames);
        otherVarNames.delete(varName);
        for (const c of indicatorCode) {
          const tp = p.dictionary.timePoints.find((t) => t.timePoint === c.timePoint);
          const availableVars = tp ? new Set(tp.vars.map((v) => v.varName)) : new Set<string>();
          if (c.rCode.trim()) {
            const result = validateRCode(c.rCode, availableVars, otherVarNames);
            if (result.syntaxErrors.length > 0 || result.warnings.length > 0) {
              hasSyntaxError = true;
            }
          }
          if (c.rFilterCode.trim()) {
            const result = validateRCode(c.rFilterCode, availableVars, otherVarNames);
            if (result.syntaxErrors.length > 0 || result.warnings.length > 0) {
              hasSyntaxError = true;
            }
          }
        }

        const nonEmpty = indicatorCode.filter((c) => c.rCode.trim() || c.rFilterCode.trim());
        let codeConsistent = true;
        if (nonEmpty.length > 1) {
          const first = nonEmpty[0];
          codeConsistent = nonEmpty.every(
            (c) => c.rCode.trim() === first.rCode.trim() && c.rFilterCode.trim() === first.rFilterCode.trim()
          );
        }

        indicators.push({
          varName,
          category: row.category || "",
          definition: row.definition || "",
          type: normalizedType,
          aggregation: normalizedAgg,
          sortOrder: i,
          hasSyntaxError,
          codeConsistent,
        });
      }

      return await serverActions.batchUploadHfaIndicators({
        indicators,
        code,
        replaceAll: uploadMode() === "replace",
      });
    },
    () => p.close(undefined),
  );

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={t3({ en: "Upload HFA Indicators from CSV", fr: "Téléverser des indicateurs HFA depuis CSV" })}
          back={() => p.close(undefined)}
        />
      }
    >
      <div class="ui-pad ui-spy">
        <div class="text-sm">
          {t3({ en: "Upload a CSV file with the following headers:", fr: "Téléversez un fichier CSV avec les en-têtes suivants :" })}
          <div class="font-700 mt-2 ml-3 font-mono text-xs">
            varName, category, definition, type, aggregation
            {sortedTimePoints.map((_, k) => `, r_code_${k + 1}, r_filter_code_${k + 1}`).join("")}
          </div>
          <div class="mt-2 text-xs opacity-60">
            {t3({
              en: `Time points (sorted): ${sortedTimePoints.map((tp, k) => `${k + 1}=${tp.timePoint}`).join(", ")}`,
              fr: `Points temporels (triés) : ${sortedTimePoints.map((tp, k) => `${k + 1}=${tp.timePoint}`).join(", ")}`,
            })}
          </div>
          <div class="mt-1 text-xs opacity-60">
            {t3({
              en: 'type: "binary"/"Boolean" or "numeric"/"Numeric". aggregation: "sum" or "avg".',
              fr: 'type : "binary"/"Boolean" ou "numeric"/"Numeric". aggregation : "sum" ou "avg".',
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

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <Button onClick={() => fileInputRef?.click()} iconName="upload" intent="neutral">
            {t3({ en: "Select CSV file", fr: "Sélectionner un fichier CSV" })}
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
