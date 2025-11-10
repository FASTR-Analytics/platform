// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateDirSize,
  calculateDirSizeSync,
  dirname,
  emptyDir,
  ensureDir,
  ensureDirSync,
  ensureFile,
  ensureFileSync,
  join,
  setPermissions,
  setPermissionsSync,
} from "./deps.ts";
import type {
  TempConfig,
  TempDirOptions,
  TempFileOptions,
  TempFilePath,
  TempItemMetadata,
  TempPath,
  TempStats,
} from "./types.ts";
import {
  TempCleanupError,
  TempCreationError,
  TempSizeLimitError,
} from "./errors.ts";
import {
  asTempFilePath,
  asTempPath,
  generateUniqueName,
  simpleDecrypt,
  simpleEncrypt,
} from "./utils.ts";

export class TempManager {
  private config: Required<TempConfig>;
  private items: Map<string, TempItemMetadata> = new Map();
  private initialized = false;

  constructor(config: TempConfig = {}) {
    const moduleDir = dirname(new URL(import.meta.url).pathname);
    this.config = {
      baseDir: config.baseDir || join(moduleDir, "__TEMP"),
      debug: config.debug ?? false,
      autoCleanup: config.autoCleanup ?? true,
      maxTotalSize: config.maxTotalSize ?? 1024 * 1024 * 1024, // 1GB default
      defaultTtl: config.defaultTtl ?? 3600000, // 1 hour default
      encryptionKey: config.encryptionKey ?? new Uint8Array(0),
    };

    if (this.config.autoCleanup) {
      this.setupAutoCleanup();
    }
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    await ensureDir(this.config.baseDir);
    await setPermissions(this.config.baseDir, 0o700);
    this.initialized = true;

    this.log("TempManager initialized", { baseDir: this.config.baseDir });
  }

  private initSync(): void {
    if (this.initialized) return;

    ensureDirSync(this.config.baseDir);
    setPermissionsSync(this.config.baseDir, 0o700);
    this.initialized = true;

    this.log("TempManager initialized", { baseDir: this.config.baseDir });
  }

  async createTempDir(options: TempDirOptions = {}): Promise<TempPath> {
    await this.init();

    const name = generateUniqueName(options.prefix, options.suffix);
    const path = join(this.config.baseDir, name);

    try {
      await ensureDir(path);

      if (options.mode !== undefined) {
        await setPermissions(path, options.mode);
      }

      const metadata: TempItemMetadata = {
        path,
        type: "directory",
        created: new Date(),
        ttl: options.ttl ?? this.config.defaultTtl,
        size: 0,
        keep: options.keep ?? false,
      };

      this.items.set(path, metadata);
      await this.checkSizeLimit();

      if (metadata.ttl && metadata.ttl > 0) {
        this.scheduleTtlCleanup(path, metadata.ttl);
      }

      this.log("Created temp directory", { path, options });

      return asTempPath(path);
    } catch (error) {
      throw new TempCreationError(path, "directory", error);
    }
  }

  createTempDirSync(options: TempDirOptions = {}): TempPath {
    this.initSync();

    const name = generateUniqueName(options.prefix, options.suffix);
    const path = join(this.config.baseDir, name);

    try {
      ensureDirSync(path);

      if (options.mode !== undefined) {
        setPermissionsSync(path, options.mode);
      }

      const metadata: TempItemMetadata = {
        path,
        type: "directory",
        created: new Date(),
        ttl: options.ttl ?? this.config.defaultTtl,
        size: 0,
        keep: options.keep ?? false,
      };

      this.items.set(path, metadata);
      this.checkSizeLimitSync();

      if (metadata.ttl && metadata.ttl > 0) {
        this.scheduleTtlCleanup(path, metadata.ttl);
      }

      this.log("Created temp directory", { path, options });

      return asTempPath(path);
    } catch (error) {
      throw new TempCreationError(path, "directory", error);
    }
  }

  async createTempFile(options: TempFileOptions = {}): Promise<TempFilePath> {
    await this.init();

    const name = generateUniqueName(
      options.prefix,
      options.extension ? `.${options.extension}` : options.suffix,
    );
    const path = join(this.config.baseDir, name);

    try {
      await ensureFile(path);

      if (options.mode !== undefined) {
        await setPermissions(path, options.mode);
      }

      const metadata: TempItemMetadata = {
        path,
        type: "file",
        created: new Date(),
        ttl: options.ttl ?? this.config.defaultTtl,
        size: 0,
        keep: options.keep ?? false,
      };

      this.items.set(path, metadata);
      await this.checkSizeLimit();

      if (metadata.ttl && metadata.ttl > 0) {
        this.scheduleTtlCleanup(path, metadata.ttl);
      }

      this.log("Created temp file", { path, options });

      return asTempFilePath(path);
    } catch (error) {
      throw new TempCreationError(path, "file", error);
    }
  }

  createTempFileSync(options: TempFileOptions = {}): TempFilePath {
    this.initSync();

    const name = generateUniqueName(
      options.prefix,
      options.extension ? `.${options.extension}` : options.suffix,
    );
    const path = join(this.config.baseDir, name);

    try {
      ensureFileSync(path);

      if (options.mode !== undefined) {
        setPermissionsSync(path, options.mode);
      }

      const metadata: TempItemMetadata = {
        path,
        type: "file",
        created: new Date(),
        ttl: options.ttl ?? this.config.defaultTtl,
        size: 0,
        keep: options.keep ?? false,
      };

      this.items.set(path, metadata);
      this.checkSizeLimitSync();

      if (metadata.ttl && metadata.ttl > 0) {
        this.scheduleTtlCleanup(path, metadata.ttl);
      }

      this.log("Created temp file", { path, options });

      return asTempFilePath(path);
    } catch (error) {
      throw new TempCreationError(path, "file", error);
    }
  }

  async writeTempFile(
    data: string | Uint8Array,
    options: TempFileOptions = {},
  ): Promise<TempFilePath> {
    const path = await this.createTempFile(options);

    let dataToWrite: Uint8Array;
    if (typeof data === "string") {
      dataToWrite = new TextEncoder().encode(data);
    } else {
      dataToWrite = data;
    }

    if (this.config.encryptionKey.length > 0) {
      dataToWrite = simpleEncrypt(dataToWrite, this.config.encryptionKey);
    }

    await Deno.writeFile(path, dataToWrite);

    // Update size
    const metadata = this.items.get(path);
    if (metadata) {
      metadata.size = dataToWrite.length;
    }

    return path;
  }

  async readTempFile(path: TempFilePath): Promise<Uint8Array> {
    let data = await Deno.readFile(path);

    if (this.config.encryptionKey.length > 0) {
      const decrypted = simpleDecrypt(data, this.config.encryptionKey);
      data = new Uint8Array(decrypted);
    }

    return data;
  }

  async readTempFileText(path: TempFilePath): Promise<string> {
    const data = await this.readTempFile(path);
    return new TextDecoder().decode(data);
  }

  async cleanup(path: string): Promise<void> {
    const metadata = this.items.get(path);
    if (!metadata) return;

    if (metadata.keep) {
      this.log("Skipping cleanup of kept item", { path });
      return;
    }

    try {
      const stat = await Deno.stat(path);
      if (stat.isDirectory) {
        await emptyDir(path);
        await Deno.remove(path);
      } else {
        await Deno.remove(path);
      }

      this.items.delete(path);
      this.log("Cleaned up temp item", { path });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        this.items.delete(path);
        return;
      }
      throw new TempCleanupError(path, error);
    }
  }

  async cleanupAll(): Promise<void> {
    const errors: Error[] = [];

    for (const [path, metadata] of this.items) {
      if (metadata.keep) continue;

      try {
        await this.cleanup(path);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      throw new TempCleanupError(
        "Multiple paths",
        new AggregateError(errors, "Failed to cleanup some temp items"),
      );
    }
  }

  async getStats(): Promise<TempStats> {
    let totalSize = 0;
    let directories = 0;
    let files = 0;
    let oldestItem: Date | null = null;
    let newestItem: Date | null = null;

    for (const metadata of this.items.values()) {
      if (metadata.type === "directory") {
        directories++;
        totalSize += await calculateDirSize(metadata.path);
      } else {
        files++;
        totalSize += metadata.size;
      }

      if (!oldestItem || metadata.created < oldestItem) {
        oldestItem = metadata.created;
      }
      if (!newestItem || metadata.created > newestItem) {
        newestItem = metadata.created;
      }
    }

    return {
      totalItems: this.items.size,
      totalSize,
      directories,
      files,
      oldestItem,
      newestItem,
    };
  }

  getStatsSync(): TempStats {
    let totalSize = 0;
    let directories = 0;
    let files = 0;
    let oldestItem: Date | null = null;
    let newestItem: Date | null = null;

    for (const metadata of this.items.values()) {
      if (metadata.type === "directory") {
        directories++;
        totalSize += calculateDirSizeSync(metadata.path);
      } else {
        files++;
        totalSize += metadata.size;
      }

      if (!oldestItem || metadata.created < oldestItem) {
        oldestItem = metadata.created;
      }
      if (!newestItem || metadata.created > newestItem) {
        newestItem = metadata.created;
      }
    }

    return {
      totalItems: this.items.size,
      totalSize,
      directories,
      files,
      oldestItem,
      newestItem,
    };
  }

  keep(path: string): void {
    const metadata = this.items.get(path);
    if (metadata) {
      metadata.keep = true;
      this.log("Marked temp item to keep", { path });
    }
  }

  unkeep(path: string): void {
    const metadata = this.items.get(path);
    if (metadata) {
      metadata.keep = false;
      this.log("Unmarked temp item to keep", { path });
    }
  }

  private async checkSizeLimit(): Promise<void> {
    const stats = await this.getStats();

    if (stats.totalSize > this.config.maxTotalSize) {
      // Clean up oldest items first
      const sortedItems = Array.from(this.items.entries())
        .filter(([_, metadata]) => !metadata.keep)
        .sort((a, b) => a[1].created.getTime() - b[1].created.getTime());

      for (const [path] of sortedItems) {
        await this.cleanup(path);

        const newStats = await this.getStats();
        if (newStats.totalSize <= this.config.maxTotalSize * 0.8) {
          break;
        }
      }

      // Check again
      const finalStats = await this.getStats();
      if (finalStats.totalSize > this.config.maxTotalSize) {
        throw new TempSizeLimitError(
          finalStats.totalSize,
          this.config.maxTotalSize,
        );
      }
    }
  }

  private checkSizeLimitSync(): void {
    const stats = this.getStatsSync();

    if (stats.totalSize > this.config.maxTotalSize) {
      throw new TempSizeLimitError(stats.totalSize, this.config.maxTotalSize);
    }
  }

  private scheduleTtlCleanup(path: string, ttl: number): void {
    setTimeout(async () => {
      try {
        await this.cleanup(path);
      } catch (error) {
        this.log("Failed to cleanup expired item", { path, error });
      }
    }, ttl);
  }

  private setupAutoCleanup(): void {
    const cleanup = async () => {
      try {
        await this.cleanupAll();
      } catch (error) {
        console.error("Failed to cleanup temp items on exit:", error);
      }
    };

    // Handle various exit scenarios
    globalThis.addEventListener("unload", cleanup);

    if (Deno.build.os !== "windows") {
      Deno.addSignalListener("SIGINT", cleanup);
      Deno.addSignalListener("SIGTERM", cleanup);
    }
  }

  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[TempManager] ${message}`, data);
    }
  }

  static createMock(baseDir?: string): TempManager {
    return new TempManager({
      baseDir: baseDir || join(Deno.cwd(), ".temp-test"),
      debug: true,
      autoCleanup: false,
    });
  }
}

// Export a default instance for backward compatibility
export const defaultTempManager = new TempManager();
