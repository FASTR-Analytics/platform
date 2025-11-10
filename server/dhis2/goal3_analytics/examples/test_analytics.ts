#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Test Analytics Functions
 * 
 * Simple test to verify analytics functions work after reorganization
 */

import { getAnalyticsFromDHIS2 } from "../mod.ts";

console.log("Testing Analytics Functions");
console.log("=" .repeat(50));

// Test with minimal parameters
const testParams = {
  dataElements: ["s46m5MS0hxu"],  // BCG doses given
  orgUnits: ["Ky2CzFdfBuO"],      // Root org unit (Guinea)
  periods: ["202301"]             // January 2023
};

try {
  console.log("\nFetching analytics data...");
  console.log("Parameters:", testParams);
  
  const result = await getAnalyticsFromDHIS2(testParams);
  
  console.log("\n✅ Analytics fetch successful!");
  console.log(`- Headers: ${result.headers.length} columns`);
  console.log(`- Rows: ${result.rows.length} data rows`);
  
  if (result.rows.length > 0) {
    console.log("\nFirst data row:", result.rows[0]);
  }
  
  if (result.metaData?.items) {
    const itemCount = Object.keys(result.metaData.items).length;
    console.log(`- Metadata items: ${itemCount}`);
  }
  
} catch (error) {
  console.error("❌ Error:", error);
}

console.log("\n" + "=" .repeat(50));
console.log("Test complete.");