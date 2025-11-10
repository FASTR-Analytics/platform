// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Extend Error interface for V8's captureStackTrace
declare global {
  interface ErrorConstructor {
    //@ts-ignore
    captureStackTrace?(thisArg: Error, constructorOpt?: Function): void;
  }
}

export type LayoutErrorType =
  | "HEIGHT_OVERFLOW"
  | "WIDTH_OVERFLOW"
  | "INVALID_COLUMN_SPAN"
  | "MEASUREMENT_FAILED";

export interface LayoutErrorDetails {
  type: LayoutErrorType;
  message: string;
  containerType?: "row" | "col";
  availableSpace?: { width: number; height: number };
  requiredSpace?: { width: number; height: number };
  itemIndex?: number;
}

export class LayoutError extends Error {
  public readonly details: LayoutErrorDetails;

  constructor(details: LayoutErrorDetails) {
    const contextInfo = [
      details.message,
      details.containerType ? `Container type: ${details.containerType}` : "",
      details.availableSpace
        ? `Available: ${details.availableSpace.width}x${details.availableSpace.height}px`
        : "",
      details.requiredSpace
        ? `Required: ${details.requiredSpace.width}x${details.requiredSpace.height}px`
        : "",
      details.itemIndex !== undefined ? `Item index: ${details.itemIndex}` : "",
    ]
      .filter(Boolean)
      .join("\n  ");

    super(contextInfo);
    this.name = "LayoutError";
    this.details = details;

    // Preserve stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LayoutError);
    }
  }
}
