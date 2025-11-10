#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Example 01: Test DHIS2 Indicators Connection
 * 
 * This example tests the connection to DHIS2 indicators endpoints and displays counts.
 * Run with: deno run --allow-net --allow-env --allow-read 01_test_indicators_connection.ts
 */

import { testIndicatorsConnection } from "../get_indicators_from_dhis2.ts";
import { FetchOptions } from "../../common/base_fetcher.ts";

// Get credentials from environment or use defaults
const dhis2Credentials = {
  url: Deno.env.get("DHIS2_URL") || "https://play.dhis2.org/40.2.2",
  username: Deno.env.get("DHIS2_USERNAME") || "admin",
  password: Deno.env.get("DHIS2_PASSWORD") || "district",
};

const options: FetchOptions = {
  dhis2Credentials,
  logRequest: true,
  logResponse: true,
};

console.log("Testing DHIS2 Indicators API Connection...");
console.log("URL:", dhis2Credentials.url);
console.log("=" .repeat(50));

try {
  const result = await testIndicatorsConnection(options);
  
  if (result.success) {
    console.log("✅ Connection successful!");
    console.log(`Message: ${result.message}`);
    
    if (result.details) {
      console.log("\nIndicators API Details:");
      console.log(`- Total Data Elements: ${result.details.dataElementCount || "Unknown"}`);
      console.log(`- Total Indicators: ${result.details.indicatorCount || "Unknown"}`);
      console.log(`- Data Element Groups: ${result.details.dataElementGroups || "Unknown"}`);
      console.log(`- Indicator Groups: ${result.details.indicatorGroups || "Unknown"}`);
    }
  } else {
    console.error("❌ Connection failed!");
    console.error(`Error: ${result.message}`);
  }
} catch (error) {
  console.error("❌ Unexpected error:", error);
}

console.log("\n" + "=" .repeat(50));
console.log("Test complete.");