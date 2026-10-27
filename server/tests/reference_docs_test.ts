// Pins the reference tools' pure halves: the base64 decode of a hub file
// (GitHub's contents API sends UTF-8 bytes as base64 in 60-character lines,
// and the text must come back exactly as written), the catalog text, the
// relevance filter and the list tool's description.
//
//   deno test -A --no-check server/tests/reference_docs_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { ReferenceDocEntry } from "lib";
import {
  buildReferenceCatalog,
  decodeBase64Utf8,
  describeReferenceDocsList,
  REFERENCE_DOCS,
  relevantReferenceDocs,
} from "lib";

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

const RECIPE: ReferenceDocEntry = {
  id: "iceh-equity-profile",
  title: "ICEH equity profile",
  description: "Recipe for an equity profile report.",
  readWhen: "when asked to create an ICEH equity profile",
  dataset: "iceh",
};

const GLOSSARY: ReferenceDocEntry = {
  id: "glossary",
  title: "Glossary",
  description: "Terms used across FASTR.",
  readWhen: "when a term is unclear",
};

const ENTRIES = [...REFERENCE_DOCS, RECIPE, GLOSSARY];

Deno.test("an entry about a dataset is listed only where the instance holds that data", () => {
  assertEquals(relevantReferenceDocs(ENTRIES, ["hmis"]), [GLOSSARY]);
  assertEquals(relevantReferenceDocs(ENTRIES, ["hmis", "iceh"]), ENTRIES);
});

const INDEX = "| [**Introduction**](00_introduction.md) | Overview |\n";

Deno.test("the catalog is the app lines with their triggers, then the hub index verbatim with its id rule", () => {
  const catalog = buildReferenceCatalog(ENTRIES, {
    prefix: "fr/",
    text: INDEX,
  });
  const lines = catalog.split("\n");
  assertEquals(lines[0], "Read a document with get_reference_doc({ id }).");
  assertStringIncludes(
    catalog,
    "- iceh: ICEH data & analyses. ICEH/Countdown survey data: data model, stratifiers, the CCI, and the wealth-inequality measures (definitions, methods, fidelity caveats). Read it before analysing ICEH survey data.",
  );
  assertStringIncludes(
    catalog,
    "- glossary: Glossary. Terms used across FASTR. Read it when a term is unclear.",
  );
  assertStringIncludes(
    catalog,
    '## FASTR methodology hub\n\nEach link target in the index below is a document id, prefixed with "fr/" (for example "fr/00_introduction.md"). The index omits some chapters: any path under the hub reads the same way.\n\n' +
      INDEX,
  );
  assert(
    lines.indexOf("## App documents") <
      lines.indexOf("## FASTR methodology hub"),
  );
  assertStringIncludes(
    buildReferenceCatalog([], { prefix: "", text: INDEX }),
    '## App documents\n\nNone for this instance\'s data.\n\n## FASTR methodology hub\n\nEach link target in the index below is a document id (for example "00_introduction.md").',
  );
});

Deno.test("a hub failure degrades the catalog to the app documents and one line", () => {
  const catalog = buildReferenceCatalog(ENTRIES, {
    error: "GitHub API error (403): rate limited",
  });
  assertStringIncludes(catalog, "- iceh: ICEH data & analyses.");
  assert(
    catalog.endsWith(
      "## FASTR methodology hub\n\nThe FASTR methodology hub could not be read (GitHub API error (403): rate limited), so its chapters are unavailable for now.",
    ),
  );
  assert(!catalog.includes("link target"));
});

Deno.test("the list tool's description names every entry with its trigger", () => {
  assertStringIncludes(
    describeReferenceDocsList(ENTRIES),
    "the app's own (read iceh before analysing ICEH survey data; read iceh-equity-profile when asked to create an ICEH equity profile; read glossary when a term is unclear) and the chapters of the FASTR methodology hub",
  );
});
