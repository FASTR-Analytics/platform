import { createMCPHttpHandler } from "@timroberton/panther";
import {
  BEARER_PREFIX,
  resolveHeadlessCredentialEmail,
} from "../headless_auth.ts";
import { mcpResourceMetadataUrl } from "../routes/public/oauth_metadata.ts";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";
import type { McpPrincipal } from "./context_cache.ts";
import { buildMcpToolsForPrincipal } from "./mcp_tools.ts";

// The remote MCP endpoint (PLAN_112): any Claude client connects with just
// the instance URL (https://<instance>/mcp) and a PAT in the Authorization
// header. Stateless above the wire (D1): identity rides every request,
// project scope rides every tool call (projectId), authorization runs per
// call. The panther adapter owns the wire (both protocol eras, sessions,
// elicitation); the D3 thunk below binds one tool set per authenticated
// principal.
//
// Auth is the shared headless-credential seam (server/headless_auth.ts) — the
// SAME resolver the per-dispatch middleware runs, which is what keeps a
// connector from listing tools and then failing every real tool call. No token
// or an unrecognized token → 401; backend failure → 503 (the adapter maps an
// authenticate throw to 503). Under BYPASS_AUTH the hook degrades to the dev
// identity exactly as the headless mount does — live smokes are only valid
// auth-on.

const INSTRUCTIONS = [
  "FASTR Analytics assistant. One connector serves every project you can access.",
  "Rules:",
  "- Call get_projects, then get_orientation with a projectId, BEFORE working — orientation carries the live project context (which metrics, visualizations, slide decks and reports exist right now).",
  "- Every project tool takes an explicit projectId plus explicit ids; discover ids with the get_available_* tools, never invent them.",
  "- Reads are safe to call freely. The only write, create_report, asks the user for confirmation before committing.",
  "- Data questions: use get_metric_data (CSV output). Load get_info topics before building domain-specific reports.",
].join("\n");

export const mcpHttpHandler = createMCPHttpHandler<McpPrincipal>({
  name: "fastr",
  version: "1.0.0",
  instructions: INSTRUCTIONS,
  tools: (ctx) => buildMcpToolsForPrincipal(ctx.principal),
  // Consent is the CLIENT's tool-permission prompt, not a second in-protocol
  // one. Every MCP client already asks before running a tool, and for the only
  // write here the arguments ARE the effect (create_report's {label, markdown}
  // is the whole report), so an elicitation round trip asked the same question
  // twice — and failed closed on any client that cannot present it, which made
  // writes unreachable from claude.ai and Desktop entirely.
  //
  // "delegate" still runs propose() in full: skip/invalid validation, the
  // stillValid staleness re-check, and the preview returned as an audit header
  // on the result. It gives up exactly one thing — a prompt the client had
  // already shown. Note the consequence: a user who has "always allow"-ed the
  // tool gets no prompt at all, which is the same posture as every other MCP
  // write tool.
  //
  // approvalPolicy is unaffected by the mode — it is a CONSTRUCTION-time guard
  // that refuses to build a server where a kind:"write" tool has no approval
  // block, so a future write cannot ship unguarded by omission.
  approvalMode: "delegate",
  approvalPolicy: { requireForKind: "write", requireKind: true },
}, {
  authenticate: async (req) => {
    if (_BYPASS_AUTH) {
      return { token: "", email: "dev@offline.local" };
    }
    const authz = req.headers.get("Authorization") ?? "";
    // A backend failure here throws — the adapter answers 503 (credentials not
    // judged), distinct from the 401 for a bad token.
    const email = await resolveHeadlessCredentialEmail(authz);
    if (email === null) {
      return null;
    }
    // The raw token rides on the principal: every server action this principal
    // dispatches re-presents it to the headless middleware, so the credential
    // is re-judged per dispatch rather than trusted from the door.
    return { token: authz.slice(BEARER_PREFIX.length), email };
  },
  principalKey: (principal) => principal.email,
  // RFC 9728 discovery: the 401 tells an OAuth-capable client WHERE to read
  // this server's protected-resource metadata, which is how claude.ai gets
  // from "Connect" to the Clerk consent screen. Derived per request from the
  // SAME helper that builds the document itself, so the pointer and its target
  // can never disagree about the resource identifier. A PAT client never sees
  // this — it arrives already authenticated.
  resourceMetadataUrl: (req) => mcpResourceMetadataUrl(req),
});
