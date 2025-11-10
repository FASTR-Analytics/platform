// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export class TempError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = "TempError";
  }
}

export class TempCreationError extends TempError {
  constructor(
    public readonly path: string,
    public readonly operation: "directory" | "file",
    cause?: unknown,
  ) {
    super(`Failed to create temp ${operation} at ${path}`, cause);
    this.name = "TempCreationError";
  }
}

export class TempCleanupError extends TempError {
  constructor(
    public readonly path: string,
    cause?: unknown,
  ) {
    super(`Failed to cleanup temp path ${path}`, cause);
    this.name = "TempCleanupError";
  }
}

export class TempSizeLimitError extends TempError {
  constructor(
    public readonly currentSize: number,
    public readonly maxSize: number,
  ) {
    super(`Temp size limit exceeded: ${currentSize} > ${maxSize} bytes`);
    this.name = "TempSizeLimitError";
  }
}

export class TempPermissionError extends TempError {
  constructor(
    public readonly path: string,
    cause?: unknown,
  ) {
    super(`Permission error for temp path ${path}`, cause);
    this.name = "TempPermissionError";
  }
}
