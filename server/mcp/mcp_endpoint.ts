import {
  createMCPHttpHandler,
  type CreateMCPServerConfig,
} from "@timroberton/panther";
import {
  BEARER_PREFIX,
  resolveHeadlessCredentialEmail,
} from "../headless_auth.ts";
import { mcpResourceMetadataUrl } from "../routes/public/oauth_metadata.ts";
import { _BYPASS_AUTH, _SERVER_VERSION } from "../exposed_env_vars.ts";
import { buildMcpPrincipal, type McpPrincipal } from "./context_cache.ts";
import { buildMcpToolsForPrincipal } from "./mcp_tools.ts";

// The remote MCP endpoint: any Claude client connects with just the instance
// URL (https://<instance>/mcp) and a PAT in the Authorization header. Stateless
// above the wire: identity rides every request, the two metric tools read the
// instance's CURRENT pinned results package on every call (no package id in
// any schema), authorization runs per call. All tools are read-only. The
// panther adapter owns the wire (both protocol eras, sessions, elicitation);
// the thunk below binds one tool set per authenticated principal.
//
// Auth is the shared headless-credential seam (server/headless_auth.ts): the
// SAME resolver the per-dispatch middleware runs, which is what keeps a
// connector from listing tools and then failing every real tool call. No token
// or an unrecognized token → 401; backend failure → 503 (the adapter maps an
// authenticate throw to 503). Under BYPASS_AUTH the hook degrades to the dev
// identity exactly as the headless mount does: live smokes are only valid
// auth-on.

const INSTRUCTIONS = [
  "FASTR Analytics assistant. get_available_metrics and get_metric_data read this instance's pinned national results package; get_reference_docs and get_reference_doc read reference docs, not the package.",
  "Rules:",
  "- Call get_overview FIRST — it carries the live grounding (which package is pinned, its datasets, indicators and period coverage) and the tool catalog.",
  "- Discover metric ids with get_available_metrics; never invent them.",
  "- All tools are read-only and safe to call freely.",
  "- Data questions: use get_metric_data (CSV output). Read the reference document get_reference_docs names for a subject before domain-specific analysis.",
].join("\n");

// Exported for the boot check in main.ts, which builds the tool set once for
// the dev identity so a construction throw fails the boot, not every request.
export const mcpServerConfig: CreateMCPServerConfig<McpPrincipal> = {
  name: "fastr",
  version: _SERVER_VERSION,
  instructions: INSTRUCTIONS,
  tools: (ctx) => buildMcpToolsForPrincipal(ctx.principal),
  // This surface has NO write tools (2026-08-19), so approvalMode is inert
  // today and approvalPolicy refuses only a tool without kind; both are kept
  // as the guard for a future write: approvalPolicy is a CONSTRUCTION-time
  // check that refuses to build a server where a kind:"write" tool has no
  // approval block, so a write cannot ship unguarded by omission. "delegate"
  // is the mode such a write would run under: consent is the CLIENT's
  // tool-permission prompt, not a second in-protocol elicitation (which
  // failed closed on clients that cannot present it); propose() still runs
  // in full and the preview rides the result as an audit header.
  approvalMode: "delegate",
  approvalPolicy: { requireForKind: "write", requireKind: true },
};

export const mcpHttpHandler = createMCPHttpHandler<McpPrincipal>(
  mcpServerConfig,
  {
    authenticate: async (req) => {
      if (_BYPASS_AUTH) {
        return await buildMcpPrincipal("", "dev@offline.local");
      }
      const authz = req.headers.get("Authorization") ?? "";
      // A backend failure here throws: the adapter answers 503 (credentials not
      // judged), distinct from the 401 for a bad token.
      const email = await resolveHeadlessCredentialEmail(authz);
      if (email === null) {
        return null;
      }
      // The raw token rides on the principal: every server action this principal
      // dispatches re-presents it to the headless middleware, so the credential
      // is re-judged per dispatch rather than trusted from the door.
      return await buildMcpPrincipal(authz.slice(BEARER_PREFIX.length), email);
    },
    // One core per credential (the key's contract is on McpPrincipal).
    principalKey: (principal) => principal.key,
    // RFC 9728 discovery: the 401 tells an OAuth-capable client WHERE to read
    // this server's protected-resource metadata, which is how claude.ai gets
    // from "Connect" to the Clerk consent screen. Derived per request from the
    // SAME helper that builds the document itself, so the pointer and its target
    // can never disagree about the resource identifier. A PAT client never sees
    // this: it arrives already authenticated.
    resourceMetadataUrl: (req) => mcpResourceMetadataUrl(req),
  },
);
