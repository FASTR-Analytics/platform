// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// ================================================================================
// ERROR CLASSES
// ================================================================================

export class FileOperationError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly operation: "read" | "write",
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FileOperationError";
  }
}

export class FileNotFoundError extends FileOperationError {
  constructor(filePath: string, operation: "read" | "write" = "read") {
    super(`File not found: ${filePath}`, filePath, operation);
    this.name = "FileNotFoundError";
  }
}

export class PermissionDeniedError extends FileOperationError {
  constructor(filePath: string, operation: "read" | "write") {
    super(
      `Permission denied ${operation}ing file: ${filePath}`,
      filePath,
      operation,
    );
    this.name = "PermissionDeniedError";
  }
}

export class InvalidFileContentError extends FileOperationError {
  constructor(filePath: string, details: string) {
    super(`Invalid file content in ${filePath}: ${details}`, filePath, "read");
    this.name = "InvalidFileContentError";
  }
}

// ================================================================================
// ERROR HANDLERS
// ================================================================================

export function handleFileError(
  error: unknown,
  filePath: string,
  operation: "read" | "write",
  fileType: string,
): never {
  if (error instanceof Deno.errors.NotFound) {
    throw new FileNotFoundError(filePath, operation);
  }

  if (error instanceof Deno.errors.PermissionDenied) {
    throw new PermissionDeniedError(filePath, operation);
  }

  const message = error instanceof Error ? error.message : String(error);
  throw new FileOperationError(
    `Failed to ${operation} ${fileType} file at ${filePath}: ${message}`,
    filePath,
    operation,
    error,
  );
}
