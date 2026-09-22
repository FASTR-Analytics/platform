// The launch wizard resolves every MODULE_REGISTRY entry through the strict
// GitHub schema, so one registered module whose definition lacks a required
// field takes the whole wizard down. This resolves them all from the local
// checkout and pins the unprefixed labels: modules are ordered by their
// declared facts, never by a number in the name.
//
// Needs the local modules checkout (FASTR_MODULES_LOCAL_DIR); skipped
// otherwise:
//   deno test -A --env-file server/tests/run_generation_module_options_test.ts

import { assert, assertEquals } from "@std/assert";
import type { Sql } from "postgres";
import { MODULE_REGISTRY } from "lib";
import { getRunGenerationModuleOptions } from "../runs/generation_wizard_reads.ts";

Deno.test({
  name: "every registry module resolves for the launch wizard, unprefixed",
  ignore: Deno.env.get("FASTR_MODULES_LOCAL_DIR") === undefined,
  async fn() {
    const res = await getRunGenerationModuleOptions(null as unknown as Sql);
    if (!res.success) throw new Error(res.err);
    assertEquals(
      res.data.modules.map((m) => m.id),
      MODULE_REGISTRY.map((m) => m.id),
    );
    for (const m of res.data.modules) {
      assert(!/^M\d+\./.test(m.label), `${m.id} label is numbered: ${m.label}`);
    }
  },
});
