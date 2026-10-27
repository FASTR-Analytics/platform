import { AIToolFailure, createAITool } from "@timroberton/panther";
import type { Language } from "@timroberton/panther";
import { z } from "zod";
import type { DatasetType } from "../types/datasets.ts";
import type { ServerActionTransport } from "../server_actions/transport.ts";
import type { ReferenceDocEntry } from "./reference_catalog.ts";

// One catalog, one pair: get_reference_docs lists every reference document
// the surface exposes, get_reference_doc reads one, the resolver picking the
// source by id. Two sources: the app's own documents (the entries the caller
// passes, served from client/public/info/) and the FASTR methodology hub on
// GitHub, whose index for the instance language is the second half of the
// catalog, verbatim, and whose ids are paths under the hub.

const HUB_API_BASE =
  "https://api.github.com/repos/FASTR-Analytics/fastr-resource-hub/contents/methodology";

// Unauthenticated GitHub API reads share 60 requests per hour per IP across
// every connector of the server, so every hub read is memoised per process.
const HUB_MEMO_TTL_MS = 10 * 60_000;

const HUB_ID_PATTERN = /^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/;

// GitHub's contents API sends the file as base64 of its UTF-8 bytes, in
// 60-character lines; atob alone yields one char per byte, so every non-ASCII
// character arrives garbled unless the bytes are decoded as UTF-8.
export function decodeBase64Utf8(content: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(content), (c) => c.charCodeAt(0)),
  );
}

class HubReadError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function fetchHubFile(path: string): Promise<string> {
  // Encode PER SEGMENT: the path legitimately contains "/" (fr/...), but
  // nothing else may escape it: a raw "?" or "#" would inject into the URL.
  const url = `${HUB_API_BASE}/${
    path.split("/").map(encodeURIComponent).join("/")
  }`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new HubReadError(
      response.status,
      `GitHub API error (${response.status}): ${
        response.statusText || "could not read the methodology hub"
      }`,
    );
  }
  const file = (await response.json()) as { content: string; encoding: string };
  if (file.encoding !== "base64") {
    throw new HubReadError(0, "Unexpected encoding from GitHub API");
  }
  return decodeBase64Utf8(file.content);
}

const hubMemo = new Map<string, { at: number; value: Promise<string> }>();

// A failed read is dropped from the memo as soon as it settles, so a
// transient failure never sticks for the TTL.
function readHubFile(path: string): Promise<string> {
  const hit = hubMemo.get(path);
  if (hit !== undefined && Date.now() - hit.at < HUB_MEMO_TTL_MS) {
    return hit.value;
  }
  const entry = { at: Date.now(), value: fetchHubFile(path) };
  hubMemo.set(path, entry);
  entry.value.catch(() => {
    if (hubMemo.get(path) === entry) hubMemo.delete(path);
  });
  return entry.value;
}

export type HubIndex =
  // `prefix` is what an id of a chapter the index links carries before the
  // link target: "fr/" for the French index, "" for the English one.
  | { prefix: string; text: string }
  | { error: string };

// The hub mirrors its index under fr/ and pt/; an instance language whose
// mirror is missing reads the English index.
async function readHubIndex(language: Language): Promise<HubIndex> {
  const prefix = language === "en" ? "" : `${language}/`;
  try {
    return { prefix, text: await readHubFile(`${prefix}index.md`) };
  } catch (e) {
    if (prefix !== "" && e instanceof HubReadError && e.status === 404) {
      return await readHubIndex("en");
    }
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function relevantReferenceDocs(
  entries: ReferenceDocEntry[],
  datasetsWithData: DatasetType[],
): ReferenceDocEntry[] {
  return entries.filter((e) =>
    e.dataset === undefined || datasetsWithData.includes(e.dataset)
  );
}

export function buildReferenceCatalog(
  entries: ReferenceDocEntry[],
  hub: HubIndex,
): string {
  const appLines = entries.map((e) =>
    `- ${e.id}: ${e.title}. ${e.description} Read it ${e.readWhen}.`
  );
  const hubSection = "error" in hub
    ? [
      `The FASTR methodology hub could not be read (${hub.error}), so its chapters are unavailable for now.`,
    ]
    : [
      `Each link target in the index below is a document id${
        hub.prefix === "" ? "" : `, prefixed with "${hub.prefix}"`
      } (for example "${hub.prefix}00_introduction.md"). The index omits some chapters: any path under the hub reads the same way.`,
      "",
      hub.text,
    ];
  return [
    "Read a document with get_reference_doc({ id }).",
    "",
    "## App documents",
    "",
    ...(appLines.length === 0 ? ["None for this instance's data."] : appLines),
    "",
    "## FASTR methodology hub",
    "",
    ...hubSection,
  ].join("\n");
}

export function describeReferenceDocsList(
  entries: ReferenceDocEntry[],
): string {
  const triggers = entries.map((e) => `read ${e.id} ${e.readWhen}`).join("; ");
  return `List the reference documents you can read with get_reference_doc: the app's own (${triggers}) and the chapters of the FASTR methodology hub (the FASTR approach to routine HMIS data analysis: indicators, data extraction, data quality assessment and adjustment, service utilisation, coverage estimates, results communication, the HFA survey). Call it before reading a document whose id you do not know.`;
}

export type ReferenceDocsInstance = {
  datasetsWithData: DatasetType[];
  instanceLanguage: Language;
};

export type ReferenceDocsSurface = {
  // Read at call time, so the catalog follows the instance's data and
  // language: /mcp resolves its instance state per call, the SPA reads its
  // live store.
  instance: () => ReferenceDocsInstance | Promise<ReferenceDocsInstance>;
  // Headless use passes the transport EXPLICITLY: reading the process-global
  // transport at call time is the confused-deputy shape a multi-principal
  // server must never touch. The SPA passes nothing and keeps its document
  // branch (same-origin fetch, no transport involved).
  transport?: ServerActionTransport;
};

async function readAppDoc(
  entry: ReferenceDocEntry,
  transport: ServerActionTransport | undefined,
): Promise<string> {
  // In the browser the documents come from the SPA origin (Vite in dev);
  // headlessly there is no origin, so the explicit transport supplies the
  // base URL, credentials, and (via fetchImpl) the in-process dispatch path.
  const headlessTransport = typeof document === "undefined"
    ? transport ?? null
    : null;
  if (typeof document === "undefined" && headlessTransport === null) {
    throw new Error(
      "get_reference_doc: headless use requires an explicit transport, passed to getSharedToolsForReferenceDocs().",
    );
  }
  const base = headlessTransport ? headlessTransport.baseUrl : "";
  const doFetch = headlessTransport?.fetchImpl ??
    ((input: string | URL | Request, init: RequestInit) => fetch(input, init));
  const response = await doFetch(`${base}/info/${entry.id}.md`, {
    cache: "no-cache",
    ...(headlessTransport
      ? {
        headers: headlessTransport.getHeaders(),
        credentials: headlessTransport.credentials,
      }
      : {}),
  });
  if (!response.ok) {
    throw new AIToolFailure(
      `Could not load reference document "${entry.id}" (${response.status}).`,
    );
  }
  return await response.text();
}

async function readHubDoc(id: string): Promise<string> {
  if (!HUB_ID_PATTERN.test(id)) {
    throw new AIToolFailure(
      `Unknown reference document "${id}". Call get_reference_docs to see the ids.`,
    );
  }
  try {
    return await readHubFile(id);
  } catch (e) {
    if (e instanceof HubReadError && e.status === 404) {
      throw new AIToolFailure(
        `Reference document "${id}" not found. Call get_reference_docs to see the ids.`,
      );
    }
    throw new AIToolFailure(e instanceof Error ? e.message : String(e));
  }
}

export function getSharedToolsForReferenceDocs(
  entries: ReferenceDocEntry[],
  surface: ReferenceDocsSurface,
) {
  return [
    createAITool({
      name: "get_reference_docs",
      description: describeReferenceDocsList(entries),
      inputSchema: z.object({}),
      handler: async () => {
        const instance = await surface.instance();
        return buildReferenceCatalog(
          relevantReferenceDocs(entries, instance.datasetsWithData),
          await readHubIndex(instance.instanceLanguage),
        );
      },
      inProgressLabel: "Listing reference documents...",
      completionMessage: "Listed reference documents",
      kind: "read",
      headless: true,
    }),
    createAITool({
      name: "get_reference_doc",
      description:
        "Read one reference document, by the id get_reference_docs lists: an app document's id (for example 'iceh') or a methodology hub path (for example '04_data_quality_assessment.md', or 'fr/04_data_quality_assessment.md' for its French mirror). Returns the document's markdown.",
      inputSchema: z.object({
        id: z.string().describe(
          "The document id, as get_reference_docs lists it.",
        ),
      }),
      handler: async (input) => {
        const entry = entries.find((e) => e.id === input.id);
        return entry === undefined
          ? await readHubDoc(input.id)
          : await readAppDoc(entry, surface.transport);
      },
      inProgressLabel: (input) => `Reading "${input.id}"...`,
      completionMessage: (input) => `Read "${input.id}"`,
      kind: "read",
      headless: true,
    }),
  ];
}
