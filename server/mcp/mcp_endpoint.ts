import { createMCPHttpHandler } from "@timroberton/panther";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  PAT_PREFIX,
  resolvePersonalAccessTokenEmail,
} from "../db/instance/personal_access_tokens.ts";
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
// Auth mirrors patOnlyMiddleware semantics: Bearer fastr_pat_… resolved via
// resolvePersonalAccessTokenEmail (verify + last_used_at stamp); no token or
// unknown token → 401; DB failure → 503 (the adapter maps an authenticate
// throw to 503). Under BYPASS_AUTH the hook degrades to the dev identity
// exactly as /pat does — live PAT smokes are only valid auth-on.

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
  approvalMode: "elicit",
  approvalPolicy: { requireForKind: "write", requireKind: true },
}, {
  authenticate: async (req) => {
    if (_BYPASS_AUTH) {
      return { token: "", email: "dev@offline.local" };
    }
    const authz = req.headers.get("Authorization");
    if (!authz?.startsWith(`Bearer ${PAT_PREFIX}`)) {
      return null;
    }
    const token = authz.slice("Bearer ".length);
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
    // A DB failure here throws — the adapter answers 503 (credentials not
    // judged), distinct from the 401 for a bad token.
    const email = await resolvePersonalAccessTokenEmail(mainDb, token);
    if (email === null) {
      return null;
    }
    return { token, email };
  },
  principalKey: (principal) => principal.email,
});
