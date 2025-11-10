#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Example 03: Fetch Indicators
 * 
 * This example demonstrates fetching indicators from DHIS2.
 * Run with: deno run --allow-net --allow-env --allow-read 03_fetch_indicators.ts
 */

import { 
  getIndicatorsFromDHIS2,
  getIndicatorGroupsFromDHIS2
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

console.log("Fetching Indicators from DHIS2...");
console.log("URL:", dhis2Credentials.url);
console.log("=" .repeat(50));

try {
  // Fetch indicator groups first
  console.log("\n1. Fetching indicator groups...");
  const groups = await getIndicatorGroupsFromDHIS2(options, false);
  console.log(`Found ${groups.length} indicator groups`);
  
  // Display first few groups
  console.log("\nSample indicator groups:");
  groups.slice(0, 5).forEach((group, index) => {
    console.log(`   ${index + 1}. ${group.name}`);
  });
  
  // Fetch first page of indicators
  console.log("\n2. Fetching first 20 indicators...");
  const indicators = await getIndicatorsFromDHIS2(options, {
    pageSize: 20,
    paging: false,
  });
  
  console.log(`Found ${indicators.length} indicators`);
  
  // Display detailed info for first few indicators
  console.log("\nSample indicators with details:");
  indicators.slice(0, 3).forEach((ind, index) => {
    console.log(`\n${index + 1}. ${ind.name}`);
    console.log(`   ID: ${ind.id}`);
    console.log(`   Code: ${ind.code || "N/A"}`);
    console.log(`   Short Name: ${ind.shortName || "N/A"}`);
    console.log(`   Annualized: ${ind.annualized || false}`);
    
    if (ind.indicatorType) {
      console.log(`   Type: ${ind.indicatorType.name} (Factor: ${ind.indicatorType.factor})`);
    }
    
    if (ind.numerator) {
      console.log(`   Numerator: ${ind.numerator.substring(0, 50)}${ind.numerator.length > 50 ? '...' : ''}`);
    }
    
    if (ind.denominator) {
      console.log(`   Denominator: ${ind.denominator.substring(0, 50)}${ind.denominator.length > 50 ? '...' : ''}`);
    }
    
    if (ind.indicatorGroups && ind.indicatorGroups.length > 0) {
      console.log(`   Groups: ${ind.indicatorGroups.map(g => g.name).join(", ")}`);
    }
  });
  
  // Filter indicators by those with formulas
  const withFormulas = indicators.filter(ind => ind.numerator && ind.denominator);
  console.log(`\n✅ Indicators with formulas: ${withFormulas.length}/${indicators.length}`);
  
} catch (error) {
  console.error("❌ Error fetching indicators:", error);
}

console.log("\n" + "=" .repeat(50));
console.log("Done.");