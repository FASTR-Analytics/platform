// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Csv } from "./deps.ts";
import { readCsvFile } from "./read_csv.ts";
import type { CsvReadOptions } from "./types.ts";

// ================================================================================
// TYPES
// ================================================================================

// Re-export CsvReadOptions as CsvOptions for backward compatibility
export type CsvOptions = CsvReadOptions;

interface CacheEntry {
  data: Csv<string>;
  size: number;
  lastAccessed: number;
  created: number;
  expiresAt: number;
  filePath: string;
  fileModTime: number;
  fileSize: number;
}

export interface CacheConfig {
  maxSizeBytes?: number;
  maxEntries?: number;
  ttlSeconds?: number;
  checkFileChanges?: boolean;
  enableMetrics?: boolean;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  entryCount: number;
  hitRate: number;
}

// ================================================================================
// CACHE IMPLEMENTATION
// ================================================================================

export class CsvCache {
  private cache = new Map<string, CacheEntry>();
  private currentSize = 0;
  private config: Required<CacheConfig>;
  private metrics = { hits: 0, misses: 0, evictions: 0 };
  private locks = new Map<string, Promise<void>>();

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSizeBytes: config.maxSizeBytes ?? 100 * 1024 * 1024, // 100MB
      maxEntries: config.maxEntries ?? 1000,
      ttlSeconds: config.ttlSeconds ?? 3600, // 1 hour
      checkFileChanges: config.checkFileChanges ?? true,
      enableMetrics: config.enableMetrics ?? false,
    };
  }

  // ================================================================================
  // PUBLIC METHODS
  // ================================================================================

  async read(filePath: string, opts?: CsvOptions): Promise<Csv<string>> {
    const key = this.getKey(filePath, opts);

    // Check cache without lock first
    const cached = await this.getValidEntry(key);
    if (cached) {
      if (this.config.enableMetrics) this.metrics.hits++;
      return cached.data;
    }

    // Acquire lock for this key to prevent duplicate reads
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    const lockPromise = this.readWithLock(key, filePath, opts).then(
      (result) => {
        this.locks.delete(key);
        return result;
      },
    );

    // Store the void promise for waiting purposes
    this.locks.set(
      key,
      lockPromise.then(() => {}),
    );

    return await lockPromise;
  }

  // ================================================================================
  // PUBLIC METHODS - CACHE MANAGEMENT
  // ================================================================================

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    if (this.config.enableMetrics) {
      this.metrics.evictions += this.cache.size;
    }
  }

  remove(filePath: string, opts?: CsvOptions): boolean {
    const key = this.getKey(filePath, opts);
    return this.removeEntry(key);
  }

  getMetrics(): CacheMetrics {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      evictions: this.metrics.evictions,
      currentSize: this.currentSize,
      entryCount: this.cache.size,
      hitRate: total > 0 ? this.metrics.hits / total : 0,
    };
  }

  resetMetrics(): void {
    this.metrics = { hits: 0, misses: 0, evictions: 0 };
  }

  getSize(): number {
    return this.currentSize;
  }

  getEntryCount(): number {
    return this.cache.size;
  }

  // ================================================================================
  // PRIVATE METHODS
  // ================================================================================

  private async readWithLock(
    key: string,
    filePath: string,
    opts?: CsvOptions,
  ): Promise<Csv<string>> {
    // Double-check cache after acquiring lock
    const cached = await this.getValidEntry(key);
    if (cached) {
      if (this.config.enableMetrics) this.metrics.hits++;
      return cached.data;
    }

    if (this.config.enableMetrics) this.metrics.misses++;

    const data = await readCsvFile(filePath, opts);
    const stats = await Deno.stat(filePath);
    this.setEntry(key, data, filePath, stats);
    return data;
  }

  private async getValidEntry(
    key: string,
    checkFileSync = false,
  ): Promise<CacheEntry | undefined> {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this.removeEntry(key);
      return undefined;
    }

    // Check file changes
    if (this.config.checkFileChanges) {
      try {
        const stats = checkFileSync
          ? Deno.statSync(entry.filePath)
          : await Deno.stat(entry.filePath);
        const mtime = stats.mtime?.getTime() ?? 0;
        if (mtime !== entry.fileModTime || stats.size !== entry.fileSize) {
          this.removeEntry(key);
          return undefined;
        }
      } catch {
        // File might have been deleted
        this.removeEntry(key);
        return undefined;
      }
    }

    entry.lastAccessed = Date.now();
    return entry;
  }

  private setEntry(
    key: string,
    data: Csv<string>,
    filePath: string,
    stats: Deno.FileInfo,
  ): void {
    const size = this.estimateSize(data);

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.removeEntry(key);
    }

    // Evict entries if necessary to make room
    while (
      (this.currentSize + size > this.config.maxSizeBytes ||
        this.cache.size >= this.config.maxEntries) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      data,
      size,
      lastAccessed: now,
      created: now,
      expiresAt: now + this.config.ttlSeconds * 1000,
      filePath,
      fileModTime: stats.mtime?.getTime() ?? 0,
      fileSize: stats.size,
    });
    this.currentSize += size;
  }

  private removeEntry(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.removeEntry(oldestKey);
      if (this.config.enableMetrics) this.metrics.evictions++;
    }
  }

  private getKey(filePath: string, opts?: CsvOptions): string {
    // Create a stable key from file path and options
    const sortedOpts = opts
      ? {
        colHeaders: opts.colHeaders,
        rowHeaders: opts.rowHeaders,
      }
      : {};
    return `${filePath}:${JSON.stringify(sortedOpts)}`;
  }

  private estimateSize(data: Csv<string>): number {
    // Efficient size estimation without full stringification
    const numRows = data.nRows();
    const numCols = data.nCols();

    // Sample-based estimation for large CSVs
    if (numRows > 100) {
      return this.estimateSizeBySampling(data, numRows, numCols);
    }

    // For small CSVs, use exact calculation
    const csvString = data.stringify();
    const stringSize = csvString.length * 2; // UTF-16
    const structuralOverhead = 2000;
    const dimensionOverhead = (numRows + numCols) * 50;

    return stringSize + structuralOverhead + dimensionOverhead;
  }

  private estimateSizeBySampling(
    data: Csv<string>,
    numRows: number,
    numCols: number,
  ): number {
    // For large CSVs, estimate based on a partial stringify
    // This is more accurate than trying to sample individual cells
    const sampleRows = Math.min(numRows, 100);

    // Create a smaller CSV with sampled rows (1-indexed)
    const sampledCsv = data.getSelectedRows(
      Array.from({ length: sampleRows }, (_, i) => i + 1),
    );
    const sampleString = sampledCsv.stringify();
    const avgBytesPerRow = (sampleString.length * 2) / sampleRows;

    // Extrapolate to full size
    const estimatedDataSize = avgBytesPerRow * numRows;

    const structuralOverhead = 2000;
    const dimensionOverhead = (numRows + numCols) * 50;

    return estimatedDataSize + structuralOverhead + dimensionOverhead;
  }

  private getSampleIndices(total: number, sampleSize: number): number[] {
    const indices: number[] = [];
    const step = Math.floor(total / sampleSize);

    for (let i = 0; i < sampleSize; i++) {
      indices.push(Math.min(i * step, total - 1));
    }

    return indices;
  }
}

// ================================================================================
// DEFAULT CACHE INSTANCE
// ================================================================================

// Create a default cache instance for backward compatibility
const defaultCache = new CsvCache();

// ================================================================================
// CONVENIENCE FUNCTIONS
// ================================================================================

// Removed sync version - use async version instead

export function readCsvFileAndCache(
  filePath: string,
  opts?: CsvOptions,
): Promise<Csv<string>> {
  return defaultCache.read(filePath, opts);
}

export function clearCsvCache(): void {
  defaultCache.clear();
}

export function getCsvCacheMetrics(): CacheMetrics {
  return defaultCache.getMetrics();
}

// ================================================================================
// FACTORY FUNCTIONS
// ================================================================================

export function createProductionCache(): CsvCache {
  return new CsvCache({
    maxSizeBytes: 500 * 1024 * 1024, // 500MB
    maxEntries: 5000,
    ttlSeconds: 3600, // 1 hour
    checkFileChanges: true,
    enableMetrics: true,
  });
}

export function createDevelopmentCache(): CsvCache {
  return new CsvCache({
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
    maxEntries: 100,
    ttlSeconds: 300, // 5 minutes
    checkFileChanges: true,
    enableMetrics: false,
  });
}

export function createTestCache(): CsvCache {
  return new CsvCache({
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    maxEntries: 10,
    ttlSeconds: 60, // 1 minute
    checkFileChanges: false,
    enableMetrics: true,
  });
}
