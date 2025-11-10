#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Example 04: Search Indicators and Data Elements
 * 
 * This example demonstrates searching for indicators and data elements by name.
 * Run with: deno run --allow-net --allow-env --allow-read 04_search_indicators.ts
 */

import { 
  searchIndicatorsFromDHIS2,
  searchDataElementsFromDHIS2,
  searchAllIndicatorsAndDataElements
} from "../get_indicators_from_dhis2.ts";
import { FetchOptions } from "../../common/base_fetcher.ts";

// Get credentials from environment or use defaults
const dhis2Credentials = {
  url: Deno.env.get("DHIS2_URL") || "https://play.dhis2.org/40.2.2",
  username: Deno.env.get("DHIS2_USERNAME") || "admin",
  password: Deno.env.get("DHIS2_PASSWORD") || "district",
};

const options: FetchOptions = {
  dhis2Credentials,
};

// Search query - change this to search for different terms
const SEARCH_QUERY = Deno.args[0] || "malaria";

console.log("Searching for Indicators and Data Elements in DHIS2...");
console.log("URL:", dhis2Credentials.url);
console.log(`Search Query: "${SEARCH_QUERY}"`);
console.log("=" .repeat(50));

try {
  // Search indicators by name
  console.log(`\n1. Searching indicators with name containing "${SEARCH_QUERY}"...`);
  const indicators = await searchIndicatorsFromDHIS2(options, SEARCH_QUERY, "name");
  
  console.log(`Found ${indicators.length} matching indicators`);
  
  if (indicators.length > 0) {
    console.log("\nMatching indicators:");
    indicators.slice(0, 5).forEach((ind, index) => {
      console.log(`   ${index + 1}. ${ind.name}`);
      if (ind.code) {
        console.log(`      Code: ${ind.code}`);
      }
    });
  }
  
  // Search data elements
  console.log(`\n2. Searching data elements with name containing "${SEARCH_QUERY}"...`);
  const dataElements = await searchDataElementsFromDHIS2(options, SEARCH_QUERY);
  
  console.log(`Found ${dataElements.length} matching data elements`);
  
  if (dataElements.length > 0) {
    console.log("\nMatching data elements:");
    dataElements.slice(0, 5).forEach((de, index) => {
      console.log(`   ${index + 1}. ${de.name}`);
      if (de.code) {
        console.log(`      Code: ${de.code}`);
      }
      if (de.valueType) {
        console.log(`      Type: ${de.valueType}`);
      }
    });
  }
  
  // Combined search
  console.log(`\n3. Combined search for both indicators and data elements...`);
  const combined = await searchAllIndicatorsAndDataElements(
    options,
    SEARCH_QUERY,
    true,
    true
  );
  
  console.log("\n✅ Search Summary:");
  console.log(`   Total Indicators Found: ${combined.indicators.length}`);
  console.log(`   Total Data Elements Found: ${combined.dataElements.length}`);
  console.log(`   Grand Total: ${combined.indicators.length + combined.dataElements.length}`);
  
  // Show usage hint
  console.log("\n💡 Tip: Pass a search term as argument to search for different items");
  console.log("   Example: deno run --allow-net --allow-env --allow-read 04_search_indicators.ts \"HIV\"");
  
} catch (error) {
  console.error("❌ Error searching:", error);
}

console.log("\n" + "=" .repeat(50));
console.log("Done.");