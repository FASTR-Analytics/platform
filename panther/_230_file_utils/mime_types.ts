// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

//////////////////////////////////////////////////////////////////////////////////////////////////////////
//  __       __  ______  __       __  ________          __                                              //
// /  \     /  |/      |/  \     /  |/        |        /  |                                             //
// $$  \   /$$ |$$$$$$/ $$  \   /$$ |$$$$$$$$/        _$$ |_    __    __   ______    ______    _______  //
// $$$  \ /$$$ |  $$ |  $$$  \ /$$$ |$$ |__          / $$   |  /  |  /  | /      \  /      \  /       | //
// $$$$  /$$$$ |  $$ |  $$$$  /$$$$ |$$    |         $$$$$$/   $$ |  $$ |/$$$$$$  |/$$$$$$  |/$$$$$$$/  //
// $$ $$ $$/$$ |  $$ |  $$ $$ $$/$$ |$$$$$/            $$ | __ $$ |  $$ |$$ |  $$ |$$    $$ |$$      \  //
// $$ |$$$/ $$ | _$$ |_ $$ |$$$/ $$ |$$ |_____         $$ |/  |$$ \__$$ |$$ |__$$ |$$$$$$$$/  $$$$$$  | //
// $$ | $/  $$ |/ $$   |$$ | $/  $$ |$$       |        $$  $$/ $$    $$ |$$    $$/ $$       |/     $$/  //
// $$/      $$/ $$$$$$/ $$/      $$/ $$$$$$$$/          $$$$/   $$$$$$$ |$$$$$$$/   $$$$$$$/ $$$$$$$/   //
//                                                             /  \__$$ |$$ |                           //
//                                                             $$    $$/ $$ |                           //
//                                                              $$$$$$/  $$/                            //
//                                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////////////////////

// ================================================================================
// MIME TYPE DETECTION
// ================================================================================

export function getMimeType(filePath: string): string {
  const ext = getExtension(filePath);

  const mimeTypes: Record<string, string> = {
    // Text formats
    csv: "text/csv",
    txt: "text/plain",
    html: "text/html",
    htm: "text/html",
    css: "text/css",

    // Data formats
    json: "application/json",
    xml: "application/xml",

    // Microsoft Office
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    pptx:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",

    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",

    // Archives
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",

    // Programming
    js: "application/javascript",
    ts: "application/typescript",
    py: "text/x-python",
    java: "text/x-java-source",

    // Other
    pdf: "application/pdf",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

export function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    return "";
  }
  return filePath.slice(lastDot + 1).toLowerCase();
}
