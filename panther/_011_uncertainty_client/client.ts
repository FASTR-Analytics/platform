// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// R Uncertainty Server - TypeScript Client
// Type-safe client for interacting with the uncertainty server

import type {
  ClientConfig,
  DeleteDataResponse,
  HealthResponse,
  UncertaintyRequest,
  UncertaintyResults,
  UploadDataResponse,
} from "./types.ts";
import { isErrorResponse } from "./types.ts";

export class UncertaintyClient {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;

  constructor(config: string | ClientConfig) {
    if (typeof config === "string") {
      this.baseUrl = config;
      this.timeout = 120000; // 2 minutes default
      this.headers = {};
    } else {
      this.baseUrl = config.baseUrl;
      this.timeout = config.timeout ?? 120000;
      this.headers = config.headers ?? {};
    }

    // Ensure baseUrl doesn't end with slash
    this.baseUrl = this.baseUrl.replace(/\/$/, "");
  }

  /**
   * Check server health
   */
  async health(): Promise<HealthResponse> {
    const response = await this.fetch("/health", {
      method: "GET",
    });

    return await this.parseResponse<HealthResponse>(response);
  }

  /**
   * Upload CSV data files
   * @param files Record of file name to File object
   * @returns Dataset ID for referencing uploaded data
   */
  async uploadData(files: Record<string, File>): Promise<string> {
    const formData = new FormData();

    for (const [name, file] of Object.entries(files)) {
      formData.append(name, file);
    }

    const response = await this.fetch("/data/upload", {
      method: "POST",
      body: formData,
      // Don't set Content-Type header for FormData (browser sets it with boundary)
    });

    const result = await this.parseResponse<UploadDataResponse>(response);
    return result.dataset_id;
  }

  /**
   * Run uncertainty analysis
   * @param request Model function, data, and parameter distributions
   * @returns Statistical summaries for each model output
   */
  async runUncertainty(
    request: UncertaintyRequest,
  ): Promise<UncertaintyResults> {
    const body = this.prepareRequestBody(request);

    const response = await this.fetch("/run-uncertainty", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return await this.parseResponse<UncertaintyResults>(response);
  }

  /**
   * Delete uploaded dataset
   * @param datasetId Dataset ID to delete
   * @returns Deletion status
   */
  async deleteData(datasetId: string): Promise<DeleteDataResponse> {
    const response = await this.fetch(`/data/${datasetId}`, {
      method: "DELETE",
    });

    return await this.parseResponse<DeleteDataResponse>(response);
  }

  /**
   * Internal fetch wrapper with timeout and error handling
   */
  private async fetch(path: string, options: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.headers,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new UncertaintyClientError(
            `Request timeout after ${this.timeout}ms`,
            "TIMEOUT",
          );
        }
        throw new UncertaintyClientError(
          `Network error: ${error.message}`,
          "NETWORK_ERROR",
        );
      }

      throw error;
    }
  }

  /**
   * Parse response and handle errors
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const text = await response.text();
      throw new UncertaintyClientError(
        `HTTP ${response.status}: ${text}`,
        "HTTP_ERROR",
        response.status,
      );
    }

    try {
      const data = await response.json();

      // Check if response is an error object
      if (isErrorResponse(data)) {
        throw new UncertaintyClientError(data.message, "SERVER_ERROR");
      }

      return data as T;
    } catch (error) {
      if (error instanceof UncertaintyClientError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new UncertaintyClientError(
          `Failed to parse response: ${error.message}`,
          "PARSE_ERROR",
        );
      }

      throw error;
    }
  }

  /**
   * Prepare request body for uncertainty analysis
   */
  private prepareRequestBody(
    request: UncertaintyRequest,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model_function: request.modelFunction,
      param_distributions: request.paramDistributions,
    };

    if (request.iterations !== undefined) {
      body.iterations = request.iterations;
    }

    if ("datasetId" in request && request.datasetId) {
      body.dataset_id = request.datasetId;
    } else if ("fixedData" in request && request.fixedData) {
      body.fixed_data = request.fixedData;
    }

    return body;
  }
}

/**
 * Custom error class for uncertainty client errors
 */
export class UncertaintyClientError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "UncertaintyClientError";
    this.code = code;
    this.statusCode = statusCode;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UncertaintyClientError);
    }
  }
}

/**
 * Helper function to create client
 */
export function createClient(config: string | ClientConfig): UncertaintyClient {
  return new UncertaintyClient(config);
}
