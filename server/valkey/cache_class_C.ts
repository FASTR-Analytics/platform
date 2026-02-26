import { getValkeyClient } from "./connection.ts";

const WRITE_TTL_BASE = 15 * 86400;
const WRITE_TTL_JITTER = 15 * 86400;
const READ_TTL = 30 * 86400;

type UnresolvedPayload<T> = {
  versionHash: string;
  dataPromise: Promise<T>;
};

export class TimCacheC<UniquenessParams, VersionParams, T> {
  private _unresolved = new Map<string, UnresolvedPayload<T>>();
  private _prefix: string;
  private _hashFuncs: {
    uniquenessHashFromParams: (ups: UniquenessParams) => string;
    versionHashFromParams: (vps: VersionParams) => string;
    parseData: (data: T) => {
      shouldStore: boolean;
      uniquenessHash: string;
      versionHash: string;
    };
  };
  constructor(
    prefix: string,
    hashFuncs: {
      uniquenessHashFromParams: (ups: UniquenessParams) => string;
      versionHashFromParams: (vps: VersionParams) => string;
      parseData: (data: T) => {
        shouldStore: boolean;
        uniquenessHash: string;
        versionHash: string;
      };
    },
  ) {
    this._prefix = prefix;
    this._hashFuncs = hashFuncs;
  }

  private _redisKey(uniquenessHash: string): string {
    return `cache:${this._prefix}:${uniquenessHash}`;
  }

  async get(
    uniquenessParams: UniquenessParams,
    versionParams: VersionParams | "any_version",
  ): Promise<T | undefined> {
    const uniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(uniquenessParams);

    const existingUnresolved = this._unresolved.get(uniquenessHash);
    if (existingUnresolved) {
      if (versionParams === "any_version") {
        return await existingUnresolved.dataPromise;
      }
      const versionHash =
        this._hashFuncs.versionHashFromParams(versionParams);
      if (existingUnresolved.versionHash === versionHash) {
        return await existingUnresolved.dataPromise;
      }
    }

    const client = getValkeyClient();
    if (!client) return undefined;

    try {
      const raw = await client.getEx(this._redisKey(uniquenessHash), {
        EX: READ_TTL,
      });
      if (!raw) return undefined;

      const parsed: { versionHash: string; data: T } = JSON.parse(raw);

      if (versionParams === "any_version") {
        return parsed.data;
      }
      const versionHash =
        this._hashFuncs.versionHashFromParams(versionParams);
      if (parsed.versionHash === versionHash) {
        return parsed.data;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  async setPromise(
    dataPromise: Promise<T>,
    optimisticUniquenessParams: UniquenessParams,
    optimisticVersionParams: VersionParams,
  ) {
    const optimisticUniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(optimisticUniquenessParams);
    const optimisticVersionHash =
      this._hashFuncs.versionHashFromParams(optimisticVersionParams);

    this._unresolved.set(optimisticUniquenessHash, {
      versionHash: optimisticVersionHash,
      dataPromise,
    });

    let data: T;
    try {
      data = await dataPromise;
    } catch (error) {
      this._unresolved.delete(optimisticUniquenessHash);
      throw error;
    }

    const d = this._hashFuncs.parseData(data);
    if (!d.shouldStore) {
      this._unresolved.delete(optimisticUniquenessHash);
      return;
    }
    if (d.versionHash !== optimisticVersionHash) {
      console.error(
        "THE VERSION HASHES DON'T MATCH",
        "Data =",
        d.versionHash,
        "Optimistic =",
        optimisticVersionHash,
      );
      this._unresolved.delete(optimisticUniquenessHash);
      return;
    }

    const client = getValkeyClient();
    if (client) {
      try {
        const key = this._redisKey(d.uniquenessHash);
        const value = JSON.stringify({
          versionHash: d.versionHash,
          data,
        });
        const ttl =
          WRITE_TTL_BASE + Math.floor(WRITE_TTL_JITTER * Math.random());
        await client.set(key, value, { EX: ttl });
      } catch {
        // Valkey write failed — not fatal
      }
    }

    this._unresolved.delete(optimisticUniquenessHash);
  }

  clear(uniquenessParams: UniquenessParams) {
    const uniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(uniquenessParams);
    this._unresolved.delete(uniquenessHash);

    const client = getValkeyClient();
    if (client) {
      client.del(this._redisKey(uniquenessHash)).catch(() => {});
    }
  }

  async clearAll(): Promise<void> {
    this._unresolved.clear();
    const client = getValkeyClient();
    if (!client) return;
    try {
      let cursor = 0;
      do {
        const result = await client.scan(cursor, {
          MATCH: `cache:${this._prefix}:*`,
          COUNT: 100,
        });
        cursor = result.cursor;
        if (result.keys.length > 0) await client.del(result.keys);
      } while (cursor !== 0);
    } catch {
      // Valkey error — degrade gracefully
    }
  }
}
