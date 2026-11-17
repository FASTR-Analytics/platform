import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import {
  scopeDefinitionSchema,
  scopeIdSchema,
  type ScopeUuid,
} from "../../types/scope.ts";
import { route } from "../route-utils.ts";

const scopeIdParamsSchema = z.object({ scope_id: scopeIdSchema });

const scopeBodySchema = z.object({
  label: z.string().trim().min(1),
  definition: scopeDefinitionSchema,
});

// A scope is an authoring object, like a folder: no owner and no flag. Every
// unrestricted user writes scopes; a restricted user writes none, since
// editing one they hold would widen their own data reads. A granted scope
// (one that limits some user's access) is changed or deleted only by a
// can_configure_users holder. Every write broadcasts the whole list as
// `scopes_updated`, which is how clients read scopes: there is no list route.
export const scopeRouteRegistry = {
  createScope: route({
    path: "/scopes",
    method: "POST",
    guard: GUARD.unrestricted,
    body: scopeBodySchema,
    response: {} as { scopeId: ScopeUuid },
  }),
  // Editing a definition changes its hash, so every figure resolved under the
  // scope shows as stale and every cached payload under the old hash is
  // simply never asked for again. The reserved "All data" scope is refused.
  updateScope: route({
    path: "/scopes/:scope_id",
    method: "PUT",
    guard: GUARD.unrestricted,
    params: scopeIdParamsSchema,
    body: scopeBodySchema,
  }),
  // Refused while a product carries the scope, and for "All data".
  deleteScope: route({
    path: "/scopes/:scope_id",
    method: "DELETE",
    guard: GUARD.unrestricted,
    params: scopeIdParamsSchema,
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
