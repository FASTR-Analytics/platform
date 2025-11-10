#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Example 02: Fetch Data Elements
 * 
 * This example demonstrates fetching data elements from DHIS2.
 * Run with: deno run --allow-net --allow-env --allow-read 02_fetch_data_elements.ts
 */

import { 
  getDataElementsFromDHIS2,
  getDataElementsFromDHIS2Paginated
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

console.log("Fetching Data Elements from DHIS2...");
console.log("URL:", dhis2Credentials.url);
console.log("=" .repeat(50));

try {
  // Fetch first page of data elements
  console.log("\n1. Fetching first 10 data elements...");
  const firstPage = await getDataElementsFromDHIS2(options, {
    pageSize: 10,
    paging: false,
  });
  
  console.log(`Found ${firstPage.length} data elements (first page)`);
  
  // Display first few
  console.log("\nSample data elements:");
  firstPage.slice(0, 3).forEach((de, index) => {
    console.log(`\n${index + 1}. ${de.name}`);
    console.log(`   ID: ${de.id}`);
    console.log(`   Code: ${de.code || "N/A"}`);
    console.log(`   Type: ${de.valueType || "N/A"}`);
    console.log(`   Aggregation: ${de.aggregationType || "N/A"}`);
    if (de.dataElementGroups && de.dataElementGroups.length > 0) {
      console.log(`   Groups: ${de.dataElementGroups.map(g => g.name).join(", ")}`);
    }
  });
  
  // Fetch with pagination
  console.log("\n2. Fetching all data elements with pagination...");
  let totalFetched = 0;
  
  const allDataElements = await getDataElementsFromDHIS2Paginated(
    options,
    { pageSize: 100 },
    (current, total) => {
      if (current - totalFetched >= 100 || current === total) {
        console.log(`   Progress: ${current}/${total} data elements fetched`);
        totalFetched = current;
      }
    }
  );
  
  console.log(`\n✅ Total data elements fetched: ${allDataElements.length}`);
  
  // Group by value type
  const typeGroups = new Map<string, number>();
  allDataElements.forEach(de => {
    const type = de.valueType || "UNKNOWN";
    typeGroups.set(type, (typeGroups.get(type) || 0) + 1);
  });
  
  console.log("\nData Elements by Value Type:");
  Array.from(typeGroups.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    
} catch (error) {
  console.error("❌ Error fetching data elements:", error);
}

console.log("\n" + "=" .repeat(50));
console.log("Done.");