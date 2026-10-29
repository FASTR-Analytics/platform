# PROTOCOL (App): Plans

> **App-specific bindings only.** The shape of a plan file, the cadence (one
> agent works the plan from start to finish and launches independent review and
> re-review agents), the step rules and the log are
> [panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md).
> Never restate them in a plan file; a plan's §0 names what
> PROTOCOL_ALL_PLANS.md's §0 lists, with the bindings below as its branch,
> floor, log section and reading order, plus any rule peculiar to that plan, and
> nothing else.

## The bindings

- **Branch.** `main`. The agent confirms it with `git branch --show-current` and
  commits to it. Never create a branch.
- **The tree is shared.** Parallel workstreams run here, so the agent confirms
  `git status` is clean before it starts and stages only its own files. A
  typecheck error outside the step's Surface is reported, not fixed.
- **The floor**, green at the end of every step:

  ```
  deno task typecheck        # server + client + lint:systems + lint:structure + lint:text-sizes + lint:sql-json + lint:plan-citations
  deno task test
  ./validate_protocols
  ./run                      # starts against the dev database
  ```

- **Conditional gates**, on top of the floor:

  | A step that touches             | also passes                                               |
  | ------------------------------- | --------------------------------------------------------- |
  | migrations                      | `./validate_migrations`                                   |
  | the base schema or the seed     | `./validate_fresh_boot`                                   |
  | the query engine or the extract | `./validate_queries`                                      |
  | help text                       | `deno task build:help-buttons`, unchanged on a second run |

- **Docs move with the code.** `lint:systems` is chained into the typecheck and
  fails when a tracked file under `server/`, `lib/` or `client/src/` is not
  claimed by exactly one SYSTEM file's `globs` manifest. A step that adds, moves
  or deletes a file edits the manifest in that same step, and rewrites the
  SYSTEM prose for any contract it changes. Neither is deferred to the closing
  step.
- **Sections.** §0 how to work this plan, §1 the problem, §2 the model, §3
  rulings, §4 steps, §5 out of scope, §6 log of departures.
- **A step reads, in order:** `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 of the plan, the step's own section in §4,
  and §6.
- **Browser verification is Tim's**, and never appears in a step, a deliverable
  or a gate. When the automated gates are green the work is done.
- **Do not ship.** `./deploy_testing` ships the working tree. A plan that ships
  something states what and when as a ruling in §3; nothing ships before the
  last step's review passes unless a ruling says otherwise.

## Where a plan's other pieces live

The plan file is the transient layer (SYSTEMS.md §6). A defect found and not
fixed goes to the plan that owns the fix if one exists, else to the relevant
SYSTEM file's **Open items**, which stand in for the defects file that
PROTOCOL_ALL_PLANS.md names. An accepted limit is stated as a fact in the SYSTEM
prose. When the plan closes, the close commit after the last step deletes the
file, and what survives is the SYSTEM prose it rewrote.
