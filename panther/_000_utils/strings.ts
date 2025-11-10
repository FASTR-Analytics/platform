// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function capitalizeFirstLetter(str: string): string {
  if (str.length === 0) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function getStringOrThrow(str: unknown): string {
  if (str === undefined) {
    throw new Error("String is undefined");
  }
  if (str === null) {
    throw new Error("String is null");
  }
  if (typeof str !== "string") {
    throw new Error("Value is not a string");
  }
  return str;
}

export function getNonEmptyStringOrThrow(str: unknown): string {
  if (str === undefined) {
    throw new Error("String is undefined");
  }
  if (str === null) {
    throw new Error("String is null");
  }
  if (typeof str !== "string") {
    throw new Error("Value is not a string");
  }
  if (str.trim() === "") {
    throw new Error("String is empty");
  }
  return str;
}

export function getCleanString(str: string): string {
  return str.replace(/\s\s+/gm, " ").trim();
}

export function getCleanStringOnOneLine(str: string): string {
  return str
    .replace(/(\r\n|\n|\r)/gm, " ")
    .replace(/\s\s+/g, " ")
    .trim();
}

export function getTruncatedString(str: string, maxCharacter: number): string {
  if (maxCharacter < 4) {
    throw new Error("maxCharacter must be at least 4 to allow for ellipsis");
  }
  if (str.length <= maxCharacter) {
    return str;
  }
  return str.slice(0, maxCharacter - 3) + "...";
}
