// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// // High-performance CSV parser with support for quoted fields and various line endings
// import { assert } from "./deps.ts";

// export function parseStrToAoA(str: string): string[][] {
//   // This is from here: https://stackoverflow.com/questions/1293147/how-to-parse-csv-data/14991797
//   const arr: string[][] = [];
//   let quote = false; // 'true' means we're inside a quoted field

//   // O(n) - single pass character-by-character parsing
//   for (let row = 0, col = 0, c = 0; c < str.length; c++) {
//     const cc = str[c];
//     const nc = str[c + 1]; // Current character, next character

//     arr[row] = arr[row] ?? []; // Create a new row if necessary
//     arr[row][col] = arr[row][col] ?? ""; // Create a new column (start with empty string) if necessary

//     // If the current character is a quotation mark, and we're inside a
//     // quoted field, and the next character is also a quotation mark,
//     // add a quotation mark to the current column and skip the next character
//     if (cc == '"' && quote && nc == '"') {
//       arr[row][col] += cc;
//       ++c;
//       continue;
//     }

//     // If it's just one quotation mark, begin/end quoted field
//     if (cc == '"') {
//       quote = !quote;
//       continue;
//     }

//     // If it's a comma and we're not in a quoted field, move onto the next column
//     if (cc == "," && !quote) {
//       ++col;
//       continue;
//     }

//     // If it's a newline (CRLF) and we're not in a quoted field, skip the next character
//     // and move on to the next row and move to column 0 of that new row
//     if (cc == "\r" && nc == "\n" && !quote) {
//       ++row;
//       col = 0;
//       ++c;
//       continue;
//     }

//     // If it's a newline (LF or CR) and we're not in a quoted field,
//     // move on to the next row and move to column 0 of that new row
//     if (cc == "\n" && !quote) {
//       ++row;
//       col = 0;
//       continue;
//     }
//     if (cc == "\r" && !quote) {
//       ++row;
//       col = 0;
//       continue;
//     }

//     // Otherwise, append the current character to the current column
//     arr[row][col] += cc;
//   }

//   const aoa = arr
//     .map((row) => row.map((cell) => cell.trim()))
//     .filter((row) => row.some((cell) => cell));

//   assert(aoa.length > 0, "No rows in string csv");
//   assert(aoa[0].length > 0, "No cols in string csv");

//   let nBlankColumnsDeleted = 0;
//   let iLastCol = aoa[0].length - 1;
//   let lastColIsAllBlank = !aoa.some((row) => row[iLastCol]);

//   while (lastColIsAllBlank) {
//     aoa.forEach((row) => {
//       row.pop();
//     });
//     nBlankColumnsDeleted += 1;
//     iLastCol = aoa[0].length - 1;
//     lastColIsAllBlank = !aoa.some((row) => row[iLastCol]);
//     assert(nBlankColumnsDeleted < 10, "Too many blank cols deleted");
//     assert(aoa.length > 0, "No rows in string csv");
//     assert(aoa[0].length > 0, "No cols in string csv");
//   }

//   return aoa;
// }
