# Archived Cache Implementations

These cache classes are the original implementations **without ProjectDirtyStates integration**. They are kept here for:

1. **Reference** - Understanding the evolution of the caching system
2. **Reuse** - Can be copied to other projects that don't have PDS infrastructure
3. **Documentation** - Shows the manual version-passing pattern we moved away from

## Files

### `TimCacheB_in_memory_only.ts`

In-memory only cache (no persistence).

**Features:**
- Simple Map-based caching
- Version-based invalidation
- In-flight request deduplication
- No IndexedDB dependency

**Use when:**
- Don't need persistence across page reloads
- Working in environment without IndexedDB
- Simple caching needs

### `TimCacheD_indexeddb.ts`

Two-tier cache with IndexedDB persistence and LRU eviction.

**Features:**
- Memory cache (LRU) for fast access
- IndexedDB persistence across page reloads
- In-flight request deduplication
- Configurable memory cache size

**Use when:**
- Need offline persistence
- Want to survive page reloads
- Have larger datasets

**Dependencies:**
```bash
npm install idb-keyval
```

## Why These Were Replaced

The new `createReactiveCache()` system (in `../reactive_cache.ts`) provides:

1. **No manual version threading** - Reads ProjectDirtyStates automatically
2. **Less boilerplate** - ~80 LOC → ~15 LOC per cache
3. **No hash duplication** - Single source of truth for keys
4. **Version as cache key** - Eliminates version mismatch bugs
5. **Context-aware** - Integrates with Solid.js reactivity

## Migration Guide

If you want to use these in a project without PDS:

### Step 1: Copy the file

```bash
cp TimCacheB_in_memory_only.ts your-project/src/cache/
# or
cp TimCacheD_indexeddb.ts your-project/src/cache/
```

### Step 2: Create cache instance

```typescript
import { TimCacheB } from "./cache/TimCacheB_in_memory_only";

const userCache = new TimCacheB<
  { userId: string },           // Uniqueness params
  { version: string },          // Version params
  UserData                      // Data type
>({
  uniquenessHashFromParams: (p) => p.userId,
  versionHashFromParams: (v) => v.version,
  parseData: (response) => ({
    shouldStore: response.success === true,
    uniquenessHash: response.data.userId,
    versionHash: response.data.lastUpdated,
  }),
});
```

### Step 3: Use in your code

```typescript
// Check cache
const cached = await userCache.get(
  { userId: "123" },
  { version: currentVersion }  // You manage versions manually
);

if (!cached) {
  // Fetch and cache
  const promise = fetchUser("123");
  userCache.setPromise(
    promise,
    { userId: "123" },
    { version: currentVersion }
  );
  const data = await promise;
}
```

### Step 4: Manage versions yourself

Unlike the PDS-integrated system, you must track versions manually:

```typescript
// Example: Version from server response
const response = await fetchData();
const version = response.lastModified;

// Store in your state management
setVersions({ ...versions, [dataId]: version });

// Use when checking cache
const cached = await cache.get({ dataId }, { version: versions[dataId] });
```

## Comparison Table

| Feature | TimCacheB/D (These) | createReactiveCache (New) |
|---------|---------------------|---------------------------|
| Version tracking | Manual | Automatic (from PDS) |
| Boilerplate | ~80 LOC per cache | ~15 LOC per cache |
| Hash duplication | Yes (3 functions) | No (auto-generated) |
| Context integration | No | Yes (Solid.js) |
| Dependencies | None (B) / idb-keyval (D) | idb-keyval + PDS |
| Use case | Generic projects | This project (with PDS) |

## When NOT to Use These

Don't use these archived versions if:

- You're working **in this wb-hmis-client project** - use the new reactive cache system
- Your project already has centralized state management - integrate with that instead
- You can use the new system - it's objectively better if you have the infrastructure

## Questions?

See the main caching plan: `/CACHE_REFACTORING_PLAN.md`
