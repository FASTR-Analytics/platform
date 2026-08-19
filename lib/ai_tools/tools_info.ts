import { AIToolFailure, createAITool } from "@timroberton/panther";
import { z } from "zod";
import type { InfoCatalogTopic } from "./info_catalog.ts";
import type { ServerActionTransport } from "../server_actions/transport.ts";

// On-demand reference docs. The caller passes the topics ITS surface exposes
// (the shared INFO_TOPICS, plus SPA-only topics on the SPA) — the same list
// it hands buildSystemPrompt, so prompt and tool share one source of truth
// with no fetch; only the markdown CONTENT is fetched on demand from
// client/public/info/<topic>.md when a topic is actually requested. Matching
// against `topics` also whitelists the fetch path (no traversal, never serves
// the SPA fallback).
//
// Headless use passes the transport EXPLICITLY (PLAN_112 step 2): reading the
// process-global transport at call time is the confused-deputy shape a
// multi-principal server must never touch. The SPA passes nothing and keeps
// its document branch (same-origin fetch, no transport involved).
export function getSharedToolsForInfo(
  topics: InfoCatalogTopic[],
  transport?: ServerActionTransport,
) {
  return [
    createAITool({
      name: "get_info",
      description:
        "Load on-demand reference documentation maintained by the app (data models, methods, definitions, caveats). Call with no argument to list available topics; call with a topic id to get its full markdown content. Load the relevant topic before domain-specific work (for example, load 'iceh' before analysing ICEH survey data).",
      inputSchema: z.object({
        topic: z
          .string()
          .optional()
          .describe(
            "Topic id to load (e.g. 'iceh'). Omit to list all available topics.",
          ),
      }),
      handler: async (input) => {
        if (!input.topic) {
          return { availableTopics: topics };
        }
        const match = topics.find((t) => t.topic === input.topic);
        if (!match) {
          throw new AIToolFailure(
            `Unknown info topic "${input.topic}". Available: ${
              topics.map((t) => t.topic).join(", ")
            }.`,
          );
        }
        // In the browser the info files come from the SPA origin (Vite in
        // dev); headlessly there is no origin, so the explicit transport
        // supplies the base URL, credentials, and (via fetchImpl) the
        // in-process dispatch path.
        const headlessTransport = typeof document === "undefined"
          ? transport ?? null
          : null;
        if (typeof document === "undefined" && headlessTransport === null) {
          throw new Error(
            "get_info: headless use requires an explicit transport — pass it to getSharedToolsForInfo().",
          );
        }
        const base = headlessTransport ? headlessTransport.baseUrl : "";
        const doFetch = headlessTransport?.fetchImpl ??
          ((input: string | URL | Request, init: RequestInit) =>
            fetch(input, init));
        const response = await doFetch(`${base}/info/${match.topic}.md`, {
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
            `Could not load info "${input.topic}" (${response.status}).`,
          );
        }
        return await response.text();
      },
      inProgressLabel: (input) =>
        input.topic
          ? `Loading "${input.topic}" reference...`
          : "Listing reference topics...",
      completionMessage: (input) =>
        input.topic
          ? `Loaded "${input.topic}" reference`
          : "Listed reference topics",
      kind: "read",
      headless: true,
    }),
  ];
}
