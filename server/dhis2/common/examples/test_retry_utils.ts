#!/usr/bin/env -S deno run

/**
 * Test Retry Utils
 * 
 * This script tests the retry utility to ensure it works correctly.
 * Run with: deno run test_retry_utils.ts
 */

import { withRetry, makeRetryable, QUICK_RETRY_OPTIONS } from "../retry_utils.ts";

console.log("Testing Retry Utilities");
console.log("=" .repeat(50));

// Test 1: Successful operation
console.log("\n1. Testing successful operation (no retry needed):");
let callCount1 = 0;
const result1 = await withRetry(async () => {
  callCount1++;
  console.log(`  Attempt ${callCount1}: Success`);
  return "Success!";
}, QUICK_RETRY_OPTIONS);
console.log(`  Result: ${result1}`);
console.log(`  Total calls: ${callCount1}`);

// Test 2: Operation that fails then succeeds
console.log("\n2. Testing operation that fails twice then succeeds:");
let callCount2 = 0;
const result2 = await withRetry(async () => {
  callCount2++;
  console.log(`  Attempt ${callCount2}:`);
  if (callCount2 < 3) {
    throw new Error("Temporary failure");
  }
  return "Success after retries!";
}, {
  maxAttempts: 5,
  initialDelayMs: 100,
  maxDelayMs: 500,
  onRetry: (attempt, error, delay) => {
    console.log(`    Retry ${attempt} after ${Math.round(delay)}ms: ${error.message}`);
  }
});
console.log(`  Result: ${result2}`);
console.log(`  Total calls: ${callCount2}`);

// Test 3: Operation that should not retry (4xx error)
console.log("\n3. Testing 4xx error (should not retry):");
let callCount3 = 0;
try {
  await withRetry(async () => {
    callCount3++;
    console.log(`  Attempt ${callCount3}: Throwing 4xx error`);
    throw new Error("API Error (404): Not found");
  }, {
    maxAttempts: 3,
    shouldRetry: (error) => {
      // Don't retry 4xx errors except 429
      if (error.message.includes("API Error (4") && !error.message.includes("429")) {
        console.log("    Not retrying 4xx error");
        return false;
      }
      return true;
    }
  });
} catch (error) {
  console.log(`  Expected error caught: ${error}`);
  console.log(`  Total calls: ${callCount3} (should be 1)`);
}

// Test 4: Testing makeRetryable wrapper
console.log("\n4. Testing makeRetryable wrapper:");
let callCount4 = 0;
const unreliableFunction = async (value: string): Promise<string> => {
  callCount4++;
  if (callCount4 < 2) {
    throw new Error("Network error");
  }
  return `Processed: ${value}`;
};

const reliableFunction = makeRetryable(unreliableFunction, {
  maxAttempts: 3,
  initialDelayMs: 50,
  onRetry: (attempt, error, delay) => {
    console.log(`  Retry ${attempt}: ${error.message}`);
  }
});

const result4 = await reliableFunction("test input");
console.log(`  Result: ${result4}`);
console.log(`  Total calls: ${callCount4}`);

// Test 5: Testing 429 rate limit (should retry)
console.log("\n5. Testing 429 rate limit error (should retry):");
let callCount5 = 0;
const result5 = await withRetry(async () => {
  callCount5++;
  console.log(`  Attempt ${callCount5}:`);
  if (callCount5 < 2) {
    throw new Error("API Error (429): Rate limited");
  }
  return "Success after rate limit!";
}, {
  maxAttempts: 3,
  initialDelayMs: 100,
  shouldRetry: (error) => {
    if (error.message.includes("API Error (4") && !error.message.includes("429")) {
      return false;
    }
    return true;
  },
  onRetry: (attempt, error, delay) => {
    console.log(`    Retry ${attempt} after rate limit`);
  }
});
console.log(`  Result: ${result5}`);
console.log(`  Total calls: ${callCount5}`);

console.log("\n" + "=" .repeat(50));
console.log("All retry utility tests completed successfully!");