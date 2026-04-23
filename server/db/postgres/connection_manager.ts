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
// Note: Manual cleanup removed - postgres.js idle_timeout (300s) handles connection lifecycle safely.
// Manual cleanup caused crashes by calling end() on pools with in-flight queries.
// See DIAGNOSIS_CONNECTION_ENDED.md for history.

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
      _CACHED_CONNECTIONS.delete(key);
      try {
        await conn.sql.end();
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
  const connections = [..._CACHED_CONNECTIONS.entries()];
  _CACHED_CONNECTIONS.clear();
  await Promise.all(
    connections.map(([key, conn]) =>
      conn.sql
        .end()
        .catch((e) => console.error(`Error closing connection ${key}:`, e))
    )
  );
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

