import { APIResponseWithData } from "lib";
import { TimCacheD } from "./caches/cache_class_D_indexeddb";

type ImageCacheData = {
  blob: Blob;
  mimeType: string;
  size: number;
  timestamp: number;
  url: string;
};

type FailureInfo = {
  timestamp: number;
  retryCount: number;
  lastError: string;
};

const DEFAULT_OPTIONS = {
  crossOrigin: "use-credentials" as const,
  timeout: 30000,
  maxRetries: 3,
  backoffBaseMs: 1000,
  maxBackoffMs: 60000,
};

// Track failed URLs with exponential backoff
const _FAILED_URLS = new Map<string, FailureInfo>();

// Track object URLs to clean them up - but don't reuse them
const _ACTIVE_OBJECT_URLS = new Set<string>();

// Create the cache instance directly
const _IMAGE_CACHE = new TimCacheD<
  { url: string },
  { url: string },
  ImageCacheData
>("img_cache", {
  uniquenessHashFromParams: (params) => params.url,
  versionHashFromParams: (params) => params.url, // Use URL as version to prevent duplicates
  parseData: (data) => ({
    shouldStore: true,
    uniquenessHash: data.url,
    versionHash: data.url, // Use URL as version
  }),
});

async function fetchWithRetries(src: string, timestamp: number): Promise<ImageCacheData> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < DEFAULT_OPTIONS.maxRetries; attempt++) {
    try {
      return await fetchImage(src, timestamp);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on CORS errors
      if (lastError.message.includes("CORS")) {
        throw lastError;
      }

      // Exponential backoff
      if (attempt < DEFAULT_OPTIONS.maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Failed to fetch image after retries");
}

async function fetchImage(src: string, timestamp: number): Promise<ImageCacheData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    DEFAULT_OPTIONS.timeout,
  );

  try {
    const response = await fetch(src, {
      signal: controller.signal,
      credentials:
        DEFAULT_OPTIONS.crossOrigin === "use-credentials"
          ? "include"
          : "same-origin",
      mode: "cors",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();

    if (!blob.type.startsWith("image/")) {
      throw new Error(`Invalid content type: ${blob.type}`);
    }

    return {
      blob,
      mimeType: blob.type,
      size: blob.size,
      timestamp, // Use the provided timestamp, not Date.now()
      url: src,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(`Timeout after ${DEFAULT_OPTIONS.timeout}ms`);
      }
      if (error.message.includes("Failed to fetch")) {
        throw new Error(`Network error or CORS issue: ${error.message}`);
      }
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  // Always create a new object URL - don't reuse
  // This fixes the bug where old Object URLs from bad blobs get reused
  const objectUrl = URL.createObjectURL(blob);
  _ACTIVE_OBJECT_URLS.add(objectUrl);

  const img = new Image();

  return new Promise((resolve, reject) => {
    img.onload = async () => {
      // Validate dimensions
      if (img.width === 0 || img.height === 0) {
        // Don't revoke - might retry later
        reject(new Error("Image has invalid dimensions"));
        return;
      }

      // Ensure image is decoded and ready for rendering
      try {
        await img.decode();
        resolve(img);
      } catch (e) {
        // Don't revoke - might retry later
        reject(new Error("Image failed to decode"));
      }
    };

    img.onerror = () => {
      // Don't revoke - might retry later
      reject(new Error("Failed to load image from blob"));
    };

    // No need for crossOrigin with blob URLs
    img.src = objectUrl;
  });
}

function isInBackoffPeriod(failureInfo: FailureInfo): boolean {
  const now = Date.now();
  const backoffMs = Math.min(
    DEFAULT_OPTIONS.backoffBaseMs * Math.pow(2, failureInfo.retryCount),
    DEFAULT_OPTIONS.maxBackoffMs
  );
  return now - failureInfo.timestamp < backoffMs;
}

export async function getImgFromCacheOrFetch(
  src: string,
): Promise<APIResponseWithData<HTMLImageElement>> {
  try {
    // Check if this URL is in failure backoff period
    const failureInfo = _FAILED_URLS.get(src);
    if (failureInfo && isInBackoffPeriod(failureInfo)) {
      return {
        success: false,
        err: `Image failed previously. In backoff period (retry ${failureInfo.retryCount}): ${failureInfo.lastError}`,
      };
    }

    // Check if we have a cached version (or in-flight request)
    // TimCacheD handles both resolved and unresolved (in-flight) internally
    const cached = await _IMAGE_CACHE.get({ url: src }, "any_version");
    if (cached) {
      const img = await blobToImage(cached.blob);
      // Clear any failure info on successful cache hit
      _FAILED_URLS.delete(src);
      return { success: true, data: img };
    }

    // No cache hit, fetch the image
    const timestamp = Date.now();
    const fetchPromise = fetchWithRetries(src, timestamp);

    // Use setPromise to handle race conditions - TimCacheD will deduplicate
    await _IMAGE_CACHE.setPromise(fetchPromise, { url: src }, { url: src });

    // Get the data after it's been stored
    const data = await _IMAGE_CACHE.get({ url: src }, "any_version");
    if (!data) {
      throw new Error("Failed to retrieve image after storing");
    }

    const img = await blobToImage(data.blob);
    // Clear any failure info on successful fetch
    _FAILED_URLS.delete(src);
    return { success: true, data: img };
  } catch (error) {
    // Track the failure for backoff
    const errorMessage = error instanceof Error ? error.message : String(error);
    const existingFailure = _FAILED_URLS.get(src);
    _FAILED_URLS.set(src, {
      timestamp: Date.now(),
      retryCount: existingFailure ? existingFailure.retryCount + 1 : 0,
      lastError: errorMessage,
    });
    
    return {
      success: false,
      err: errorMessage,
    };
  }
}

// Clean up object URLs on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    for (const url of _ACTIVE_OBJECT_URLS) {
      URL.revokeObjectURL(url);
    }
    _ACTIVE_OBJECT_URLS.clear();
  });
}

// Export utility functions for cache management
export function clearImageFailure(url: string): void {
  _FAILED_URLS.delete(url);
}

export function clearAllImageFailures(): void {
  _FAILED_URLS.clear();
}

export function clearImageCache(url: string): void {
  _IMAGE_CACHE.clearEntry({ url });
  _FAILED_URLS.delete(url);
}

export function clearAllImageCache(): void {
  _IMAGE_CACHE.clearMemory();
  _FAILED_URLS.clear();
  // Revoke all active object URLs
  for (const url of _ACTIVE_OBJECT_URLS) {
    URL.revokeObjectURL(url);
  }
  _ACTIVE_OBJECT_URLS.clear();
}
