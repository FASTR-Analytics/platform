// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Csv, type jsPDF } from "./deps.ts";
import { saveAs } from "./file_saver_vendored.ts";

export function downloadCsv<T>(csv: Csv<T> | string, filename?: string) {
  const blob = new Blob([csv instanceof Csv ? csv.stringify() : csv], {
    type: "text/plain;charset=utf-8",
  });
  saveAs(blob, filename ?? "data.csv");
}

export function downloadText(text: string, filename?: string) {
  const blob = new Blob([text], {
    type: "text/plain;charset=utf-8",
  });
  saveAs(blob, filename ?? "data.txt");
}

export function downloadJson(
  json: Object,
  filename?: string,
  keepUndefined?: "keep-undefined",
) {
  const str = keepUndefined === "keep-undefined"
    ? JSON.stringify(
      json,
      function (k, v) {
        return v === undefined ? null : v;
      },
      2,
    ).replaceAll("null,", "undefined,")
    : JSON.stringify(json, null, 2);
  const blob = new Blob([str], {
    type: "application/json;charset=utf-8",
  });
  saveAs(blob, filename ?? "data.json");
}

export function downloadPdf(pdf: jsPDF, filename?: string) {
  const blob = pdf.output("blob");
  saveAs(blob, filename ?? "document.pdf");
}
