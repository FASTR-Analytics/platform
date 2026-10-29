import Papa from "papaparse";
import { type APIResponseWithData, encodeRawCsvHeader } from "lib";
import { _IS_PRODUCTION } from "../exposed_env_vars.ts";

export type StreamingCsvComponents = {
  headers: string[];
  encodedHeaderToIndexMap: Map<string, number>;
  processRows: (
    callback: (
      row: string[],
      rowIndex: number,
      bytesRead: number,
    ) => void | Promise<void>,
  ) => Promise<void>;
};

export type CsvColumnValidation = "strict" | "allow-fewer-columns";

const CHUNK_SIZE = 2 * 1024 * 1024;

function parseCsvRows(text: string): string[][] {
  return Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    dynamicTyping: false,
    header: false,
  }).data;
}

export async function getCsvStreamComponents(
  assetFilePath: string,
  columnValidation: CsvColumnValidation = "strict",
): Promise<APIResponseWithData<StreamingCsvComponents>> {
  try {
    // Open file for reading headers
    let file: Deno.FsFile;
    try {
      file = await Deno.open(assetFilePath, { read: true });
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
        err: `Failed to open CSV file: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }

    try {
      let headerChunk: string;
      try {
        // 64 KB, so a very wide header still fits in the first read
        const headerBuffer = new Uint8Array(65536);
        const bytesRead = await file.read(headerBuffer);
        if (!bytesRead) {
          throw new Error("CSV file is empty");
        }
        headerChunk = new TextDecoder().decode(
          headerBuffer.subarray(0, bytesRead),
        );
      } finally {
        file.close();
      }

      const [rawHeaders] = parseCsvRows(headerChunk);
      if (!rawHeaders) {
        throw new Error("CSV header row is empty");
      }

      // Clean headers by removing ":::" suffix and trimming
      const headers = rawHeaders.map((header) => {
        const parts = header.split(":::");
        return parts[0].trim();
      });

      if (!_IS_PRODUCTION) {
        console.log(`[CSV Streaming] Found ${headers.length} headers`);
      }

      const encodedHeaderToIndexMap = new Map<string, number>();
      headers.forEach((str, i) => {
        const encodedHeader = encodeRawCsvHeader(i, str);
        encodedHeaderToIndexMap.set(encodedHeader, i);
      });

      const checkColumnCount = (row: string[], rowIndex: number) => {
        if (columnValidation === "allow-fewer-columns") {
          if (row.length > headers.length) {
            throw new Error(
              `Row ${
                rowIndex + 2
              } has ${row.length} columns but header only has ${headers.length} columns`,
            );
          }
        } else if (row.length !== headers.length) {
          throw new Error(
            `Row ${
              rowIndex + 2
            } has ${row.length} columns but header has ${headers.length} columns`,
          );
        }
      };

      // No queue: a detached consumer loop's rejection has no handler while
      // the reader awaits the next chunk.
      const processRows = async (
        callback: (
          row: string[],
          rowIndex: number,
          bytesRead: number,
        ) => void | Promise<void>,
      ): Promise<void> => {
        const localFile = await Deno.open(assetFilePath, { read: true });

        if (!_IS_PRODUCTION) {
          console.log(
            `[CSV Streaming] Starting to process file: ${assetFilePath}`,
          );
        }

        try {
          let rowIndex = -1;
          let isFirstRow = true;
          let leftoverBuffer = "";
          let totalBytesRead = 0;

          const deliverRows = async (text: string) => {
            for (const row of parseCsvRows(text)) {
              if (isFirstRow) {
                isFirstRow = false;
                continue;
              }
              rowIndex++;
              checkColumnCount(row, rowIndex);
              await callback(row, rowIndex, totalBytesRead);
              if (!_IS_PRODUCTION && (rowIndex + 1) % 100000 === 0) {
                console.log(`[CSV Streaming] Processed ${rowIndex + 1} rows`);
              }
            }
          };

          // One persistent decoder in stream mode: a multibyte UTF-8 sequence
          // split across a chunk boundary must be held back until its
          // remaining bytes arrive, not emitted as U+FFFD replacement
          // characters.
          const buffer = new Uint8Array(CHUNK_SIZE);
          const decoder = new TextDecoder();

          // A chunk boundary must never split a quoted field: Papa parses
          // each slice independently, so cutting at a newline inside quotes
          // (routine in ODK exports) mis-frames every row after it. Track
          // quote parity across chunks and cut only at newlines outside
          // quotes: RFC4180 "" escapes toggle twice with no newline
          // possible between the two quote chars, so parity is exact.
          // leftoverBuffer never contains a safe newline by construction,
          // so only the newly decoded chunk needs scanning.
          let inQuotes = false;

          while (true) {
            const bytesRead = await localFile.read(buffer);
            if (!bytesRead) {
              // Flush the streaming decoder (emits any held-back partial
              // sequence as U+FFFD: at true EOF that's genuinely bad data)
              leftoverBuffer += decoder.decode();
              if (leftoverBuffer) {
                await deliverRows(leftoverBuffer);
              }
              break;
            }

            totalBytesRead += bytesRead;
            const chunk = decoder.decode(buffer.subarray(0, bytesRead), {
              stream: true,
            });

            let lastSafeNewline = -1;
            for (let i = 0; i < chunk.length; i++) {
              const code = chunk.charCodeAt(i);
              if (code === 34) {
                inQuotes = !inQuotes;
              } else if (code === 10 && !inQuotes) {
                lastSafeNewline = i;
              }
            }

            const dataToProcess = leftoverBuffer + chunk;

            if (lastSafeNewline === -1) {
              leftoverBuffer = dataToProcess;
              continue;
            }

            const boundary = leftoverBuffer.length + lastSafeNewline;
            leftoverBuffer = dataToProcess.slice(boundary + 1);
            await deliverRows(dataToProcess.slice(0, boundary));
          }

          if (!_IS_PRODUCTION) {
            console.log(
              `[CSV Streaming] Complete! Total rows processed: ${rowIndex + 1}`,
            );
          }
        } finally {
          localFile.close();
        }
      };

      const components: StreamingCsvComponents = {
        headers,
        encodedHeaderToIndexMap,
        processRows,
      };

      return { success: true, data: components };
    } catch (e) {
      return {
        success: false,
        err: e instanceof Error ? e.message : `Unexpected error: ${String(e)}`,
      };
    }
  } catch (e) {
    return {
      success: false,
      err: e instanceof Error ? e.message : `Unexpected error: ${String(e)}`,
    };
  }
}

export function getCsvColumnIndex(
  encodedHeaderToIndexMap: Map<string, number>,
  mappings: Record<string, string>,
  columnName: string,
): number {
  const csvColToUse = mappings[columnName];
  if (!csvColToUse) {
    throw new Error(`Column ${columnName} is not properly mapped`);
  }
  const index = encodedHeaderToIndexMap.get(csvColToUse);
  if (index === undefined) {
    throw new Error(
      `Header not found in uploaded csv for column ${columnName}`,
    );
  }
  return index;
}
