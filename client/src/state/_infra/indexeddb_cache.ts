import { get, set } from "idb-keyval";

type ResolvedPayload<T> = {
  versionHash: string;
  data: T;
};

type UnresolvedPayload<T> = {
  versionHash: string;
  dataPromise: Promise<T>;
};

export class TimCacheD<UniquenessParams, VersionParams, T> {
  private _resolved = new Map<string, ResolvedPayload<T>>();
  private _unresolved = new Map<string, UnresolvedPayload<T>>();
  private _name;
  private _hashFuncs;
  private _maxSize: number;
  private _accessOrder = new Map<string, number>();

  constructor(
    name: string,
    hashFuncs: {
      uniquenessHashFromParams: (ups: UniquenessParams) => string;
      versionHashFromParams: (vps: VersionParams) => string;
      parseData: (data: T) => {
        shouldStore: boolean;
        uniquenessHash: string;
        versionHash: string;
      };
    },
    maxSize: number = 100, // Default to 100 items in memory
  ) {
    this._name = name;
    this._hashFuncs = hashFuncs;
    this._maxSize = maxSize;
  }

  getIdbKey(uniqunessHash: string): string {
    return this._name + "/" + uniqunessHash;
  }

  private _evictLRU(): void {
    if (this._resolved.size <= this._maxSize) {
      return;
    }

    // Find least recently used item
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, time] of this._accessOrder.entries()) {
      if (time < oldestTime && this._resolved.has(key)) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._resolved.delete(oldestKey);
      this._accessOrder.delete(oldestKey);
    }
  }

  async get(
    uniquenessParams: UniquenessParams,
    versionParams: VersionParams | "any_version",
  ): Promise<T | undefined> {
    const uniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(uniquenessParams);

    const existingInMemory = this._resolved.get(uniquenessHash);
    if (existingInMemory) {
      // Track access for LRU
      this._accessOrder.set(uniquenessHash, Date.now());

      if (versionParams === "any_version") {
        return existingInMemory.data;
      }
      const versionHash = this._hashFuncs.versionHashFromParams(versionParams);
      if (existingInMemory.versionHash === versionHash) {
        return existingInMemory.data;
      }
    }
    const key = this.getIdbKey(uniquenessHash);
    const existing: ResolvedPayload<T> | undefined = await get(key);
    if (existing) {
      // Evict LRU if needed before adding
      this._evictLRU();
      this._resolved.set(uniquenessHash, existing);
      this._accessOrder.set(uniquenessHash, Date.now());

      if (versionParams === "any_version") {
        return existing.data;
      }
      const versionHash = this._hashFuncs.versionHashFromParams(versionParams);
      if (existing.versionHash === versionHash) {
        return existing.data;
      }
    }
    const existingUnresolved = this._unresolved.get(uniquenessHash);
    if (existingUnresolved) {
      if (versionParams === "any_version") {
        return await existingUnresolved.dataPromise;
      }
      const versionHash = this._hashFuncs.versionHashFromParams(versionParams);
      if (existingUnresolved.versionHash === versionHash) {
        return await existingUnresolved.dataPromise;
      }
    }
    return undefined;
  }

  async setPromise(
    dataPromise: Promise<T>,
    optimisticUniquenessParams: UniquenessParams,
    optimisticVersionParams: VersionParams,
  ) {
    const optimisticUniquenessHash = this._hashFuncs.uniquenessHashFromParams(
      optimisticUniquenessParams,
    );
    const optimisticVersionHash = this._hashFuncs.versionHashFromParams(
      optimisticVersionParams,
    );
    // Check if already in flight to prevent race conditions
    const existingUnresolved = this._unresolved.get(optimisticUniquenessHash);
    if (
      existingUnresolved &&
      existingUnresolved.versionHash === optimisticVersionHash
    ) {
      // Already processing this exact request
      return;
    }

    this._unresolved.set(optimisticUniquenessHash, {
      versionHash: optimisticVersionHash,
      dataPromise,
    });

    try {
      const data = await dataPromise;
      const d = this._hashFuncs.parseData(data);
      if (!d.shouldStore) {
        // FIX: Clean up unresolved to prevent memory leak
        this._unresolved.delete(optimisticUniquenessHash);
        return;
      }
      if (d.versionHash !== optimisticVersionHash) {
        console.error(
          "THE VERSION HASHES DON'T MATCH",
          this._name,
          "Data =",
          d.versionHash,
          "Optimistic =",
          optimisticVersionHash,
        );
        this._unresolved.delete(optimisticUniquenessHash);
        return;
      }
      const valueToStore = {
        versionHash: d.versionHash,
        data,
      };

      // Evict LRU if needed before adding
      this._evictLRU();
      this._resolved.set(d.uniquenessHash, valueToStore);
      this._accessOrder.set(d.uniquenessHash, Date.now());

      const key = this.getIdbKey(d.uniquenessHash);
      await set(key, valueToStore);
      this._unresolved.delete(optimisticUniquenessHash);
    } catch (error) {
      // Clean up on error to prevent memory leak
      this._unresolved.delete(optimisticUniquenessHash);
      console.error(`Cache setPromise error for ${this._name}:`, error);
      throw error;
    }
  }

  // Clear all in-memory caches
  clearMemory(): void {
    this._resolved.clear();
    this._unresolved.clear();
    this._accessOrder.clear();
  }

  // Clear a specific entry
  clearEntry(uniquenessParams: UniquenessParams): void {
    const uniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(uniquenessParams);
    this._resolved.delete(uniquenessHash);
    this._unresolved.delete(uniquenessHash);
    this._accessOrder.delete(uniquenessHash);
  }
}
