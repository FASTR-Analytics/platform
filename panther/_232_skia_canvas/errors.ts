// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export class FontRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FontRegistrationError";
  }
}

export class CanvasCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasCreationError";
  }
}

export class FileWriteError extends Error {
  constructor(message: string, public readonly filePath: string) {
    super(message);
    this.name = "FileWriteError";
  }
}

export class InvalidDimensionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDimensionsError";
  }
}
