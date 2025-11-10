import { routeRegistry } from "lib";

// Track which routes have been defined
const definedRoutes = new Set<keyof typeof routeRegistry>();

// Export function to mark a route as defined
export function markRouteDefined<K extends keyof typeof routeRegistry>(routeName: K) {
  definedRoutes.add(routeName);
}

// Validate all routes at startup
export function validateAllRoutesDefined(): void {
  console.log("\n🔍 Validating route definitions...\n");
  
  const allRoutes = Object.keys(routeRegistry) as (keyof typeof routeRegistry)[];
  const definedRoutesList = Array.from(definedRoutes);
  
  // Check for missing routes (in registry but not implemented)
  const missing = allRoutes.filter(route => !definedRoutes.has(route));
  
  // Check for extra routes (implemented but not in registry)
  const extra = definedRoutesList.filter(route => !allRoutes.includes(route));
  
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
  
  if (hasErrors) {
    console.error("⚠️  WARNING: Route mismatches may cause runtime errors!\n");
  } else {
    console.log(`✅ All ${allRoutes.length} routes correctly implemented!\n`);
  }
}

// Backwards compatibility
export const markRouteDefinedEnhanced = markRouteDefined;