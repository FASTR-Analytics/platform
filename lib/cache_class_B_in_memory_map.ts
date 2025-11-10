type ResolvedPayload<T> = {
  versionHash: string;
  data: T;
};

type UnresolvedPayload<T> = {
  versionHash: string;
  dataPromise: Promise<T>;
};

export class TimCacheB<UniquenessParams, VersionParams, T> {
  private _resolved = new Map<string, ResolvedPayload<T>>();
  private _unresolved = new Map<string, UnresolvedPayload<T>>();
  private _hashFuncs;

  constructor(hashFuncs: {
    uniquenessHashFromParams: (ups: UniquenessParams) => string;
    versionHashFromParams: (vps: VersionParams) => string;
    parseData: (data: T) => {
      shouldStore: boolean;
      uniquenessHash: string;
      versionHash: string;
    };
  }) {
    this._hashFuncs = hashFuncs;
  }

  async get(
    uniquenessParams: UniquenessParams,
    versionParams: VersionParams | "any_version"
  ): Promise<T | undefined> {
    const uniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(uniquenessParams);
    const existing = this._resolved.get(uniquenessHash);
    if (existing) {
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
    optimisticVersionParams: VersionParams
  ) {
    const optimisticUniquenessHash = this._hashFuncs.uniquenessHashFromParams(
      optimisticUniquenessParams
    );
    const optimisticVersionHash = this._hashFuncs.versionHashFromParams(
      optimisticVersionParams
    );
    this._unresolved.set(optimisticUniquenessHash, {
      versionHash: optimisticVersionHash,
      dataPromise,
    });

    let data: T;
    try {
      data = await dataPromise;
    } catch (error) {
      // Promise rejected - remove from cache to avoid caching errors
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
        optimisticVersionHash
      );
      this._unresolved.delete(optimisticUniquenessHash);
      return;
    }
    this._resolved.set(d.uniquenessHash, {
      versionHash: d.versionHash,
      data,
    });
    this._unresolved.delete(optimisticUniquenessHash);
  }

  clear(uniquenessParams: UniquenessParams) {
    const uniquenessHash =
      this._hashFuncs.uniquenessHashFromParams(uniquenessParams);
    this._resolved.delete(uniquenessHash);
  }
}
