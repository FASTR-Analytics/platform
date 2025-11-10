import Papa from "papaparse";
import { type APIResponseWithData, type CsvDetails } from "lib";

export async function getCsvDetails(
  assetFilePath: string,
  fileName: string
): Promise<APIResponseWithData<CsvDetails>> {
  try {
    let csvFile: Uint8Array;
    try {
      csvFile = await Deno.readFile(assetFilePath);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        return { success: false, err: `CSV file not found: ${assetFilePath}` };
      }
      if (e instanceof Deno.errors.PermissionDenied) {
        return {
          success: false,
          err: `Permission denied reading CSV file: ${assetFilePath}`,
        };
      }
      return {
        success: false,
        err: `Failed to read CSV file: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }

    if (csvFile.byteLength === 0) {
      return { success: false, err: "CSV file is empty" };
    }

    const file = new File([new Uint8Array(csvFile)], fileName);

    let rawHeaders: string[];
    try {
      rawHeaders = await new Promise<string[]>((res, rej) => {
        let headers: string[] | null = null;
        // @ts-ignore - worker option is supported but not in types
        Papa.parse(file, {
          worker: false,
          skipEmptyLines: true,
          dynamicTyping: false,
          header: false,
          step: (results: Papa.ParseStepResult<string[]>, papaparse) => {
            if (headers === null) {
              headers = results.data as string[];
              if (headers.length === 0) {
                papaparse.abort();
                rej(new Error("CSV header row is empty"));
              } else {
                papaparse.abort();
              }
            }
          },
          complete: () => {
            if (!headers || headers.length === 0) {
              rej(new Error("CSV file has no headers"));
            } else {
              res(headers);
            }
          },
          error: (error: Papa.ParseError) => {
            rej(new Error(`CSV parsing error: ${error.message || error}`));
          },
        });
      });
    } catch (e) {
      return {
        success: false,
        err: e instanceof Error ? e.message : String(e),
      };
    }

    const headers = rawHeaders.map((header) => {
      const parts = header.split(":::");
      return parts[0].trim();
    });

    const csvDetails: CsvDetails = {
      fileName,
      filePath: assetFilePath,
      dateUploaded: new Date().toISOString(),
      headers,
      size: csvFile.byteLength,
    };
    return { success: true, data: csvDetails };
  } catch (e) {
    return {
      success: false,
      err: e instanceof Error ? e.message : `Unexpected error: ${String(e)}`,
    };
  }
}
