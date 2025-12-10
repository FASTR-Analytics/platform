import { join } from "@std/path";
import {
  getXlsxSheetNames,
  readXlsxFileAsSingleCsv,
} from "@timroberton/panther";

const rootDir = new URL(".", import.meta.url).pathname;
const inputPath = join(
  rootDir,
  "translation_files/FRENCH_UI_STRINGS_FINAL.xlsx",
);

const sheetNames = getXlsxSheetNames(inputPath);

const translationMap: Record<
  string,
  Record<
    string,
    {
      en: string;
      fr: string;
    }
  >
> = {};

const ids = new Set<string>();

for (const sheetName of sheetNames) {
  translationMap[sheetName] = {};
  const csv = readXlsxFileAsSingleCsv(inputPath, {
    sheetNameToTake: sheetName,
    rowHeaders: "none",
  });

  const json = csv.toObjects();

  for (const entry of json) {
    const uniqueCombo = sheetName + entry.id;
    if (ids.has(entry.id)) {
      throw new Error("Duplicate id: " + uniqueCombo);
    }
    ids.add(uniqueCombo);

    translationMap[sheetName][entry.id] = {
      en: entry["EN"],
      fr: entry["FR"],
    };
  }
}

const str = `export const T = ${
  JSON.stringify(
    translationMap,
    null,
    2,
  )
} as const;

`;

const outputPath = join(rootDir, "lib/translate/ui_strings.ts");
await Deno.writeTextFile(outputPath, str);
