// Regression pin for the methodology tools' base64 decode (PLAN_COPILOT02_FIXES
// step 4, D18): GitHub's contents API sends UTF-8 bytes as base64 in
// 60-character lines, and the text must come back exactly as written.
//
//   deno test -A --no-check server/tests/methodology_docs_decode_test.ts

import { assertEquals } from "@std/assert";
import { decodeBase64Utf8 } from "../../lib/ai_tools/tools_methodology_docs.ts";

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

const FRENCH =
  "# Méthodologie\n\nLa complétude des rapports a été évaluée à 62 % ce trimestre ; voir « Données ».\n";

Deno.test("decodeBase64Utf8: UTF-8 text, French accents included, decodes as written", () => {
  assertEquals(decodeBase64Utf8(encodeUtf8Base64(FRENCH)), FRENCH);
});

Deno.test("decodeBase64Utf8: base64 in 60-character lines, as GitHub sends it, decodes", () => {
  const wrapped = encodeUtf8Base64(FRENCH).match(/.{1,60}/g)!.join("\n") +
    "\n";
  assertEquals(decodeBase64Utf8(wrapped), FRENCH);
});
