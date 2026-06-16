import { z } from "zod";
import { routeRegistry, routeRegistryIndividualCount } from "lib";

// Track which routes have been defined
const definedRoutes = new Set<keyof typeof routeRegistry>();

// Export function to mark a route as defined
export function markRouteDefined<K extends keyof typeof routeRegistry>(routeName: K) {
  definedRoutes.add(routeName);
}

// Validate all routes at startup — throws (Deno.exit(1)) on any mismatch
export function validateAllRoutesDefined(): void {
  console.log("\n🔍 Validating route definitions...\n");

  const allRoutes = Object.keys(routeRegistry) as (keyof typeof routeRegistry)[];
  const definedRoutesList = Array.from(definedRoutes);

  // Check for missing routes (in registry but not implemented)
  const missing = allRoutes.filter(route => !definedRoutes.has(route));

  // Check for extra routes (implemented but not in registry)
  const extra = definedRoutesList.filter(route => !allRoutes.includes(route));

  // Check for key collisions across feature registries (a collision reduces the merged count)
  const mergedCount = allRoutes.length;
  const keyCollision = routeRegistryIndividualCount !== mergedCount;

  // Check for duplicate method + path pairs
  const methodPaths = new Set<string>();
  const duplicateMethodPaths: string[] = [];
  for (const entry of Object.values(routeRegistry)) {
    const key = `${entry.method} ${entry.path}`;
    if (methodPaths.has(key)) {
      duplicateMethodPaths.push(key);
    } else {
      methodPaths.add(key);
    }
  }

  let hasErrors = false;

  if (missing.length > 0) {
    hasErrors = true;
    console.error(`❌ Missing routes: ${missing.length} routes not implemented`);
    for (const route of missing) {
      const routeInfo = routeRegistry[route];
      console.error(`   - ${route}: ${routeInfo.method} ${routeInfo.path}`);
    }
    console.error("");
  }

  if (extra.length > 0) {
    hasErrors = true;
    console.error(`❌ Extra routes: ${extra.length} routes defined but not in registry`);
    for (const route of extra) {
      console.error(`   - ${String(route)}`);
    }
    console.error("");
  }

  if (keyCollision) {
    hasErrors = true;
    console.error(`❌ Registry key collision: ${routeRegistryIndividualCount} individual routes but only ${mergedCount} after merge — a key name is duplicated across feature registries`);
    console.error("");
  }

  if (duplicateMethodPaths.length > 0) {
    hasErrors = true;
    console.error(`❌ Duplicate method+path pairs in registry:`);
    for (const mp of duplicateMethodPaths) {
      console.error(`   - ${mp}`);
    }
    console.error("");
  }

  // Check schema/path placeholder agreement for ALL routes (unconditional).
  // Every route whose path has :placeholders must have a z.object params schema
  // declaring exactly those keys — a missing schema is itself an error, not a skip.
  const schemaPathMismatches: string[] = [];
  for (const [routeName, entry] of Object.entries(routeRegistry)) {
    const paramsSchema = (entry as any).params;
    const pathKeys = (entry.path.match(/:(\w+)/g) ?? [])
      .map((p: string) => p.slice(1))
      .sort();
    const isZodObject = paramsSchema instanceof z.ZodType && "shape" in paramsSchema;
    if (isZodObject) {
      const schemaKeys = Object.keys((paramsSchema as z.ZodObject<any>).shape).sort();
      if (JSON.stringify(schemaKeys) !== JSON.stringify(pathKeys)) {
        schemaPathMismatches.push(
          `${routeName}: path [${pathKeys.join(", ")}] ≠ schema [${schemaKeys.join(", ")}]`
        );
      }
    } else if (pathKeys.length > 0) {
      schemaPathMismatches.push(
        `${routeName}: path [${pathKeys.join(", ")}] has placeholders but no z.object params schema`
      );
    }
  }
  if (schemaPathMismatches.length > 0) {
    hasErrors = true;
    console.error(`❌ Schema/path placeholder mismatches: ${schemaPathMismatches.length}`);
    for (const mp of schemaPathMismatches) {
      console.error(`   - ${mp}`);
    }
    console.error("");
  }

  // Body schemas must not declare a key that the client transport carries in a
  // different channel — otherwise the client strips it from the body (see
  // buildRequestParams) while the server's Zod body validator still requires it,
  // producing a "field: expected ..., received undefined" 400. A body key is
  // carried elsewhere if it is a path placeholder (→ URL) or "projectId" on a
  // requiresProject route (→ Project-Id header).
  const bodyTransportConflicts: string[] = [];
  for (const [routeName, entry] of Object.entries(routeRegistry)) {
    const bodySchema = (entry as any).body;
    if (!(bodySchema instanceof z.ZodType) || !("shape" in bodySchema)) continue;
    const pathKeys = new Set(
      (entry.path.match(/:(\w+)/g) ?? []).map((p: string) => p.slice(1)),
    );
    const requiresProject = (entry as any).requiresProject === true;
    for (const key of Object.keys((bodySchema as z.ZodObject<any>).shape)) {
      if (pathKeys.has(key)) {
        bodyTransportConflicts.push(`${routeName}: body key "${key}" is also a path placeholder (stripped from body)`);
      } else if (key === "projectId" && requiresProject) {
        bodyTransportConflicts.push(`${routeName}: body key "projectId" is carried by the Project-Id header on a requiresProject route (stripped from body)`);
      }
    }
  }
  if (bodyTransportConflicts.length > 0) {
    hasErrors = true;
    console.error(`❌ Body/transport conflicts: ${bodyTransportConflicts.length}`);
    for (const c of bodyTransportConflicts) {
      console.error(`   - ${c}`);
    }
    console.error("");
  }

  if (hasErrors) {
    console.error("💥 Route validation failed — fix the above errors before shipping.\n");
    Deno.exit(1);
  } else {
    console.log(`✅ All ${allRoutes.length} routes correctly implemented!\n`);
  }
}
