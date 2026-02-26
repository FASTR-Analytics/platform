import postgres, { Sql } from "postgres";
import { _PG_HOST, _PG_PASSWORD, _PG_PORT } from "../../exposed_env_vars.ts";

// PostgreSQL connection options with best practices
const DEFAULT_CONNECTION_OPTIONS = {
  user: "postgres",
  hostname: _PG_HOST,
  password: _PG_PASSWORD,
  port: Number(_PG_PORT),

  // Connection pool settings
  max: 20, // Maximum number of connections in pool
  idle_timeout: 300, // Close idle connections after 5 minutes (increased for cache warming)
  connect_timeout: 10, // Connection timeout in seconds

  // Query timeout settings
  statement_timeout: 300000, // Cancel queries after 5 minutes (PostgreSQL setting)
  query_timeout: 300000, // Client-side query timeout (postgres.js setting)

  // Performance settings
  prepare: true, // Use prepared statements for better performance

  // Error handling
  onnotice: () => {}, // Suppress notices in production

  // Transform settings
  transform: {
    undefined: null, // Convert undefined to null
  },
} as const;

// Enhanced connection cache with metadata
interface CachedConnection {
  sql: Sql;
  createdAt: Date;
  lastUsed: Date;
  useCount: number;
}

const _CACHED_CONNECTIONS = new Map<string, CachedConnection>();
const MAX_CACHE_AGE_MS = 30 * 60 * 1000; // 30 minutes
const MAX_IDLE_TIME_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup interval reference
let cleanupInterval: number | undefined;

/**
 * Start periodic cleanup of stale connections
 */
function startCleanupInterval() {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(() => {
      cleanupStaleConnections();
    }, 60 * 1000); // Run every minute
  }
}

/**
 * Clean up stale connections based on age and idle time
 */
async function cleanupStaleConnections() {
  const now = new Date();
  const toRemove: string[] = [];

  for (const [key, conn] of _CACHED_CONNECTIONS.entries()) {
    const age = now.getTime() - conn.createdAt.getTime();
    const idleTime = now.getTime() - conn.lastUsed.getTime();

    if (age > MAX_CACHE_AGE_MS || idleTime > MAX_IDLE_TIME_MS) {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    const conn = _CACHED_CONNECTIONS.get(key);
    if (conn) {
      try {
        await conn.sql.end();
      } catch (e) {
        console.error(`Error closing connection for ${key}:`, e);
      }
      _CACHED_CONNECTIONS.delete(key);
    }
  }
}

/**
 * Get a PostgreSQL connection with specific options
 * Creates a fresh connection pool - caller is responsible for closing it with .end()
 * Use getPgConnectionFromCacheOrNew for normal operations (auto-managed lifecycle)
 */
export function getPgConnection(
  databaseId: string,
  options?: {
    max?: number;
    readonly?: boolean;
  }
): Sql {
  return postgres({
    ...DEFAULT_CONNECTION_OPTIONS,
    database: databaseId,
    max: options?.max ?? DEFAULT_CONNECTION_OPTIONS.max,
  });
}

/**
 * Get a cached connection or create a new one
 */
export function getPgConnectionFromCacheOrNew(
  id: string,
  permissions: "READ_ONLY" | "READ_AND_WRITE"
): Sql {
  try {
    startCleanupInterval();

    const key = `${id}_${permissions}`;
    const cached = _CACHED_CONNECTIONS.get(key);

    if (cached) {
      // Update last used time
      cached.lastUsed = new Date();
      cached.useCount++;
      return cached.sql;
    } else {
      // Create new connection with appropriate settings
      const sql = getPgConnection(id);

      _CACHED_CONNECTIONS.set(key, {
        sql,
        createdAt: new Date(),
        lastUsed: new Date(),
        useCount: 1,
      });

      return sql;
    }
  } catch (e) {
    throw new Error(
      `Could not get db with id: ${id} - ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
}

/**
 * Close a specific connection and remove from cache
 */
export async function closePgConnection(
  id: string,
  permissions?: "READ_ONLY" | "READ_AND_WRITE"
): Promise<void> {
  const keys = permissions
    ? [`${id}_${permissions}`]
    : [`${id}_READ_ONLY`, `${id}_READ_AND_WRITE`];

  for (const key of keys) {
    const conn = _CACHED_CONNECTIONS.get(key);
    if (conn) {
      try {
        await conn.sql.end();
        _CACHED_CONNECTIONS.delete(key);
      } catch (e) {
        console.error(`Error closing connection ${key}:`, e);
      }
    }
  }
}

/**
 * Close all connections and clean up
 */
export async function closeAllConnections(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = undefined;
  }

  const promises: Promise<void>[] = [];

  for (const [key, conn] of _CACHED_CONNECTIONS.entries()) {
    promises.push(
      conn.sql
        .end()
        .catch((e) => console.error(`Error closing connection ${key}:`, e))
    );
  }

  await Promise.all(promises);
  _CACHED_CONNECTIONS.clear();
}

/**
 * Check if a connection is healthy
 */
export async function checkPgConnection(sql: Sql): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Get connection statistics for monitoring
 */
export function getConnectionStats() {
  const stats = {
    totalConnections: _CACHED_CONNECTIONS.size,
    connections: [] as Array<{
      id: string;
      createdAt: Date;
      lastUsed: Date;
      useCount: number;
      ageMs: number;
      idleMs: number;
    }>,
  };

  const now = new Date();

  for (const [key, conn] of _CACHED_CONNECTIONS.entries()) {
    stats.connections.push({
      id: key,
      createdAt: conn.createdAt,
      lastUsed: conn.lastUsed,
      useCount: conn.useCount,
      ageMs: now.getTime() - conn.createdAt.getTime(),
      idleMs: now.getTime() - conn.lastUsed.getTime(),
    });
  }

  return stats;
}

