# PROTOCOL (App): Plans

> **App-specific bindings only.** The shape of a multi-session plan, the
> Do/Review/Fix cadence, the three session definitions, the two-things
> rule, the step rules and the build log are
> [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md).
> Never restate them in a plan file; a plan's §0 names the bindings below
> and any rule peculiar to that plan, and nothing else.

## The bindings

- **Branch.** `tim-branch`. Every session confirms it with `git branch
  --show-current` and commits to it. Never create a branch.
- **The tree is shared.** Parallel workstreams run here, so a session
  confirms `git status` is clean before it starts and stages only its own
  files. A typecheck error outside the step's Surface is reported, not
  fixed.
- **The floor**, green at the end of every step:

  ```
  deno task typecheck        # server + client + lint:systems + lint:structure + lint:text-sizes
  deno task test
  ./validate_protocols
  ./run                      # starts against the dev database
  ```

- **Conditional gates**, on top of the floor:

  | A step that touches | also passes |
  | --- | --- |
  | migrations | `./validate_migrations` |
  | the base schema or the seed | `./validate_fresh_boot` |
  | the query engine or the extract | `./validate_queries` |
  | help text | `deno task build:help-buttons`, unchanged on a second run |

- **Docs move with the code.** `lint:systems` is chained into the
  typecheck and fails when a tracked file under `server/`, `lib/` or
  `client/src/` is not claimed by exactly one SYSTEM file's `globs`
  manifest. A step that adds, moves or deletes a file edits the manifest in
  that same step, and rewrites the SYSTEM prose for any contract it
  changes. Neither is deferred to the closing step.
- **Sections.** §0 bindings, §1 the problem, §2 the model, §3 rulings,
  §4 steps, §5 gates catalogue, §6 out of scope, §7 rollout and rollback,
  §8 build log.
- **A step reads, in order:** `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file
  for each area the step names, §2 and §3 of the plan, the step's own
  section in §4, and §8.
- **Browser verification is Tim's**, and never appears in a step, a
  deliverable or a gate. When the automated gates are green the work is
  done.
- **Do not ship.** `./deploy_testing` ships the working tree. A plan's §7
  says what ships and when; nothing ships before the last step's review
  passes unless §7 says otherwise.

## Where a plan's other pieces live

The plan file is the transient layer (SYSTEMS.md §6). A finding too small
for a plan goes to the relevant SYSTEM file's **Open items** instead. When
the plan closes, its review deletes the file in the same commit that lands
the last change, and what survives is the SYSTEM prose it rewrote.
