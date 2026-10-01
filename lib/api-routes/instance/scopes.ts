import { z } from "zod";
import { scopeDefinitionSchema } from "../../types/scope.ts";
import { route } from "../route-utils.ts";

const scopeIdParamsSchema = z.object({ scope_id: z.uuid() });

const scopeBodySchema = z.object({
  label: z.string(),
  definition: scopeDefinitionSchema,
});

// Scopes are managed by global admins only. Every write broadcasts the whole
// list as `scopes_updated`, which is how clients read scopes: there is no
// list route.
export const scopeRouteRegistry = {
  createScope: route({
    path: "/scopes",
    method: "POST",
    body: scopeBodySchema,
    response: {} as { scopeId: string },
  }),
  // Editing a definition changes its hash, so every figure resolved under the
  // scope shows as stale and every cached payload under the old hash is
  // simply never asked for again.
  updateScope: route({
    path: "/scopes/:scope_id",
    method: "PUT",
    params: scopeIdParamsSchema,
    body: scopeBodySchema,
  }),
  // Refused while a product carries the scope.
  deleteScope: route({
    path: "/scopes/:scope_id",
    method: "DELETE",
    params: scopeIdParamsSchema,
  }),
} as const;
