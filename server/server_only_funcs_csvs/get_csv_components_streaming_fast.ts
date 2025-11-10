import Papa from "papaparse";
import { encodeRawCsvHeader, type APIResponseWithData } from "lib";
import { _IS_PRODUCTION } from "../exposed_env_vars.ts";

export type StreamingCsvComponents = {
  headers: string[];
  encodedHeaderToIndexMap: Map<string, number>;
  processRows: (
    callback: (
      row: string[],
      rowIndex: number,
      bytesRead: number
    ) => void | Promise<void>
  ) => Promise<void>;
};

export type CsvColumnValidation = "strict" | "allow-fewer-columns";

export async function getCsvStreamComponents(
  assetFilePath: string,
  columnValidation: CsvColumnValidation = "strict"
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
      // Read more to ensure we get headers even with very wide CSVs
      const headerBuffer = new Uint8Array(65536); // 64KB for headers
      const bytesRead = await file.read(headerBuffer);
      if (!bytesRead || bytesRead === 0) {
        throw new Error("CSV file is empty");
      }

      file.close();

      const headerChunk = new TextDecoder().decode(
        headerBuffer.slice(0, bytesRead)
      );

      // Get headers from the initial chunk
      const rawHeaders = await new Promise<string[]>((res, rej) => {
        let headers: string[] | null = null;
        Papa.parse<string[]>(headerChunk, {
          skipEmptyLines: true,
          dynamicTyping: false,
          header: false,
          step: (results: Papa.ParseStepResult<string[]>, parser) => {
            if (headers === null) {
              headers = results.data;
              if (headers.length === 0) {
                parser.abort();
                rej(new Error("CSV header row is empty"));
              } else {
                parser.abort();
                res(headers);
              }
            }
          },
          error: (error: any) => {
            rej(new Error(`CSV parsing error: ${error.message || error}`));
          },
        });
      });

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

      // Process rows function that streams through the file
      const processRows = async (
        callback: (
          row: string[],
          rowIndex: number,
          bytesRead: number
        ) => void | Promise<void>
      ): Promise<void> => {
        const localFile = await Deno.open(assetFilePath, { read: true });

        // OPTIMIZATION 1: Much larger chunk size for better I/O efficiency
        const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (32x larger than original)

        // OPTIMIZATION 2: Much larger queue to minimize pause/resume cycles
        const MAX_QUEUE_SIZE = 50000; // 50x larger queue (can hold 50k rows)
        const RESUME_THRESHOLD = 10000; // Resume when queue drops below 10k

        // OPTIMIZATION 3: Larger batch processing
        const BATCH_SIZE = 1000; // Process rows in larger batches

        if (!_IS_PRODUCTION) {
          console.log(
            `[CSV Streaming] Starting to process file: ${assetFilePath}`
          );
        }

        try {
          const rowQueue: { row: string[]; rowIndex: number }[] = [];
          let rowIndex = -1;
          let isFirstRow = true;
          let parsingComplete = false;
          let processingError: Error | null = null;
          let isPaused = false;
          let leftoverBuffer = "";
          let chunksRead = 0;
          let totalBytesRead = 0;
          let rowsProcessed = 0;

          // OPTIMIZATION 4: Batch queue processor
          const processQueue = async () => {
            while (rowQueue.length > 0 || !parsingComplete) {
              if (processingError) {
                throw processingError;
              }

              if (rowQueue.length === 0) {
                // OPTIMIZATION 5: Shorter wait time
                await new Promise((resolve) => setTimeout(resolve, 1));
                continue;
              }

              // Process in batches
              const batch: typeof rowQueue = [];
              const batchSize = Math.min(BATCH_SIZE, rowQueue.length);

              for (let i = 0; i < batchSize; i++) {
                batch.push(rowQueue.shift()!);
              }

              if (isPaused && rowQueue.length < RESUME_THRESHOLD) {
                isPaused = false;
              }

              try {
                // Process batch
                for (const item of batch) {
                  await callback(item.row, item.rowIndex, totalBytesRead);
                  rowsProcessed++;

                  // Log progress every 100000 rows
                  if (!_IS_PRODUCTION && rowsProcessed % 100000 === 0) {
                    console.log(
                      `[CSV Streaming] Processed ${rowsProcessed} rows`
                    );
                  }
                }
              } catch (e) {
                processingError = e as Error;
                throw e;
              }
            }
          };

          // Start queue processor
          const queuePromise = processQueue();

          // Read and parse file in chunks
          const buffer = new Uint8Array(CHUNK_SIZE);

          try {
            while (true) {
              // Wait if queue is full
              while (rowQueue.length >= MAX_QUEUE_SIZE && !processingError) {
                isPaused = true;
                await new Promise((resolve) => setTimeout(resolve, 1));
              }

              if (processingError) {
                break;
              }

              const bytesRead = await localFile.read(buffer);
              if (!bytesRead || bytesRead === 0) {
                // Process any remaining data
                if (leftoverBuffer) {
                  if (!_IS_PRODUCTION) {
                    console.log(
                      `[CSV Streaming] Processing leftover buffer (${leftoverBuffer.length} chars)`
                    );
                  }

                  // OPTIMIZATION 7: Parse all remaining rows at once
                  Papa.parse<string[]>(leftoverBuffer, {
                    skipEmptyLines: true,
                    dynamicTyping: false,
                    header: false,
                    complete: (results) => {
                      for (const row of results.data) {
                        if (isFirstRow) {
                          isFirstRow = false;
                          continue;
                        }

                        rowIndex++;

                        if (columnValidation === "allow-fewer-columns") {
                          // Allow rows with fewer columns (missing trailing values)
                          // but not rows with more columns than headers
                          if (row.length > headers.length) {
                            processingError = new Error(
                              `Row ${rowIndex + 2} has ${
                                row.length
                              } columns but header only has ${headers.length} columns`
                            );
                            return;
                          }
                        } else {
                          // Strict validation: row must have exact same number of columns
                          if (row.length !== headers.length) {
                            processingError = new Error(
                              `Row ${rowIndex + 2} has ${
                                row.length
                              } columns but header has ${headers.length} columns`
                            );
                            return;
                          }
                        }

                        rowQueue.push({ row, rowIndex });
                      }
                    },
                    error: (error: any) => {
                      processingError = new Error(
                        `CSV parsing error at row ${rowIndex + 2}: ${
                          error.message || error
                        }`
                      );
                    },
                  });
                }
                break;
              }

              chunksRead++;
              totalBytesRead += bytesRead;

              // Log chunk reading every 100 chunks
              if (
                !_IS_PRODUCTION &&
                (chunksRead % 100 === 0 ||
                  totalBytesRead % (100 * 1024 * 1024) < CHUNK_SIZE)
              ) {
                console.log(
                  `[CSV Streaming] Read chunk #${chunksRead} (total: ${(
                    totalBytesRead /
                    1024 /
                    1024
                  ).toFixed(2)}MB)`
                );
              }

              const chunk = new TextDecoder().decode(
                buffer.slice(0, bytesRead)
              );
              const dataToProcess = leftoverBuffer + chunk;

              // Find the last complete line
              const lastNewline = dataToProcess.lastIndexOf("\n");
              let completeData: string;

              if (lastNewline === -1) {
                leftoverBuffer = dataToProcess;
                continue;
              } else {
                completeData = dataToProcess.slice(0, lastNewline);
                leftoverBuffer = dataToProcess.slice(lastNewline + 1);
              }

              // OPTIMIZATION 8: Parse complete chunk at once
              Papa.parse<string[]>(completeData, {
                skipEmptyLines: true,
                dynamicTyping: false,
                header: false,
                complete: (results) => {
                  for (const row of results.data) {
                    if (isFirstRow) {
                      isFirstRow = false;
                      continue;
                    }

                    rowIndex++;

                    if (columnValidation === "allow-fewer-columns") {
                      // Allow rows with fewer columns (missing trailing values)
                      // but not rows with more columns than headers
                      if (row.length > headers.length) {
                        processingError = new Error(
                          `Row ${rowIndex + 2} has ${
                            row.length
                          } columns but header only has ${headers.length} columns`
                        );
                        return;
                      }
                    } else {
                      // Strict validation: row must have exact same number of columns
                      if (row.length !== headers.length) {
                        processingError = new Error(
                          `Row ${rowIndex + 2} has ${
                            row.length
                          } columns but header has ${headers.length} columns`
                        );
                        return;
                      }
                    }

                    rowQueue.push({ row, rowIndex });
                  }
                },
                error: (error: any) => {
                  processingError = new Error(
                    `CSV parsing error at row ${rowIndex + 2}: ${
                      error.message || error
                    }`
                  );
                },
              });

              if (processingError) {
                break;
              }
            }
          } catch (innerError) {
            throw innerError;
          }

          parsingComplete = true;
          if (!_IS_PRODUCTION) {
            console.log(
              `[CSV Streaming] File reading complete. Waiting for queue to finish processing...`
            );
          }
          await queuePromise;

          if (!_IS_PRODUCTION) {
            console.log(
              `[CSV Streaming] Complete! Total rows processed: ${rowsProcessed}`
            );
          }
          try {
            localFile.close();
          } catch {
            // File might already be closed by the reader
          }
        } catch (e) {
          try {
            localFile.close();
          } catch {
            // File might already be closed by the reader
          }
          throw e;
        }
      };

      const components: StreamingCsvComponents = {
        headers,
        encodedHeaderToIndexMap,
        processRows,
      };

      return { success: true, data: components };
    } catch (e) {
      file.close();
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
  columnName: string
): number {
  const csvColToUse = mappings[columnName];
  if (!csvColToUse) {
    throw new Error(`Column ${columnName} is not properly mapped`);
  }
  const index = encodedHeaderToIndexMap.get(csvColToUse);
  if (index === undefined) {
    throw new Error(
      `Header not found in uploaded csv for column ${columnName}`
    );
  }
  return index;
}
