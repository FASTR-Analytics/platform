# Protocol: Plans

**Scope:** All

How to write a `PLAN_*.md` that a fresh agent can execute over many sessions
without supervision, and how each of those sessions behaves. This is the shape.
Each app binds it to its own branch, gates and section numbers (see "What a plan
binds"), and each plan adds only the rules peculiar to itself.

Use it when work is too big for one session and needs a review between steps.
Small work does not need a plan file at all: a work list and a verification line
are enough.

## The idea

A plan is a contract between sessions that share no memory. The whole
instruction to a fresh agent is one sentence: **"Do the next step of
PLAN_NAME.md."** Everything the agent needs is in the file. What the plan says
is decided before work starts; what actually happened is appended as it goes.
Those two halves never mix, which is what lets the file be read top to bottom by
an agent that was not there for any of it.

A plan is transient. It mutates the app's durable docs, and it is deleted when
its work lands.

## The cadence

A session does exactly one thing, named by the **Next step** line at the top of
the plan: `Do N` builds step N; `Review N` reviews it; `Fix N` builds the work
list a review left. Steps alternate Do and Review, and the line moves on only
when a review passes. A session never does two of these.

**Session start.** Confirm the branch the plan names, and confirm the tree is
clean. Sessions are serial, so a dirty tree means another session did not
finish: stop and say so. Never create a branch. Every session ends with a
closing row in the build log (`Step N built`, `Step N reviewed: pass`,
`Step N reviewed: K findings`, `Step N fixed`); if the **Next step** line and
the last closing row disagree, stop and say so. Then read, in the order the plan
gives, only what the plan says a step requires.

**A Do session** builds the step as its own section says, within its Surface,
and ends when the step's gates and the floor are green, the build log has the
rows the step produced plus its closing row, the **Next step** line says
`Review N`, and the last commit is made. Then it stops.

**A Review session** is a fresh agent that did not write the code. It lists the
step's commits (`git log` from the commit that last set the **Next step** line
to `Do N` or `Fix N`) and checks four things:

1. Nothing outside the step's Surface changed. Diff the stat against the surface
   list; every file outside it is a finding.
2. Every item in the step's Deliverable is present in the code, established by
   reading the code, never the commit message or the log.
3. Every gate in the step's Gates and in the floor passes when the reviewer runs
   it. A gate the reviewer cannot run from a file in the repo or a command in
   the plan is itself a finding.
4. The build log has the rows the step should have produced: deviations, facts
   the step found wrong in the plan, and defects found by running the app.

Each finding is one row in the build log with the file and line, followed by the
closing row. The review ends with the **Next step** line set to `Do N+1` if
there are no findings that change code, or `Fix N` if there are. After the last
step's review passes, the reviewer deletes the plan file in its last commit
instead of setting the line. Then it stops.

**A Fix session** is a Do session whose work list is the review's findings and
nothing else. It ends with its closing row and the line set to `Review N`.

## The two-things rule

**Every session edits exactly two things in the plan file:** the **Next step**
line and the build log. It never rewrites a ruling, a step section or a fact,
even one it has shown to be wrong; it records the disagreement in the build log,
and the code wins. The edit rides the session's last commit, so the tree and the
plan always agree.

Deleting the file after the last review is the one exception.

If a session cannot finish, it leaves the tree green at the last good commit,
records in the build log exactly what is done and what is not, leaves the **Next
step** line unchanged, and says so.

## Rules that bind every step

- **The step ends green.** The app's floor (see below) plus the step's own
  gates. Every gate is something the reviewer can run: a script in the repo, a
  task, or a harness file the Do session committed. Never a one-off the doer ran
  and described. Where a step's Gates say "a harness", the harness is a
  committed file.
- **Touch only the surface the step names.** A typecheck error outside that
  surface is reported, not fixed. A rename, a cleanup or a deletion the step
  does not list waits for the step that does. Skipping this is what produces
  hundred-file commits that no reviewer can check.
- **Where the plan and the code disagree, the code wins**, and the build log
  records it. A ruling is overruled only by the person whose plan it is, in the
  rulings section, before the step that depends on it.
- **Docs move with the code.** Prose describing a contract the step changes is
  rewritten in the same step, never deferred to the closing step.
- **Append to the build log before committing.** Every deviation, every fact
  found wrong, every defect found by running the app, with the step number and
  the reason. The next agent reads the log first.
- **One thing per session.** Commit with a message that says why. Where a step
  says "several commits", each one is green on its own.
- **Do not ship.** The plan's rollout section says what may ship and when.

## The shape of a plan file

| Section                  | Holds                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Header                   | Status, what the plan does in a paragraph, the **Next step** line, the branch, the repos touched, what to read first                   |
| §0 How to work this plan | The bindings below, and any rule peculiar to this plan                                                                                 |
| §1 The problem           | Why, grounded in the code, with file and line                                                                                          |
| §2 The model             | The end state in the plan's own vocabulary                                                                                             |
| §3 Rulings               | Numbered, decided. A ruling the author derived rather than heard is marked _(proposed)_ and stands unless overruled here before `Do 1` |
| §4 Steps                 | One section per step                                                                                                                   |
| §5 Gates catalogue       | Whole-plan gates and the step that first reaches each                                                                                  |
| §6 Out of scope          | Named, so it is not reopened                                                                                                           |
| §7 Rollout and rollback  | What ships, in what order, and how to undo it                                                                                          |
| §8 Build log             | Append-only                                                                                                                            |

Numbering is a convention, not a rule; what matters is that §0 names the build
log's section so every other rule can refer to it.

Each step section has five parts, in this order:

- **Surface.** Every file the step may touch. This is what the review diffs
  against.
- **Deliverable.** What must be true in the code when the step is done, by
  reference to the rulings.
- **Not in this step.** The neighbouring work a reader would expect here.
- **Gates.** On top of the floor.
- **Ends with.** One commit, or several, each green.

## The build log

Append-only, newest last, one row per decision, deviation, correction or defect,
plus one closing row per session. It is the only part of the file that grows
during the work, and the first part the next agent reads.

Two things belong there and nowhere else: a fact the plan got wrong, and a
choice a session had to make that the rulings did not cover. A resolved row is
never edited or deleted; it is the record of why the code looks the way it does
after the plan is gone.

## What a plan binds

The plan's §0 names these, because they differ by app and by plan. Nothing in
this protocol names them.

- **The plan file's own name**, for the one-sentence instruction.
- **The branch.** Every session confirms it and commits to it.
- **The floor**: the commands that must be green at the end of every step, and
  the conditional ones (the gate a step touching migrations also runs, and so
  on). These are the app's, and the app's own docs are where they live; §0 lists
  them.
- **The build log's section number**, and the reading order for a step.
- **The last step number**, after whose review the file is deleted.
- **The vocabulary** the plan uses, defined once.

A worked §0 is roughly this, plus any rule peculiar to the plan:

```markdown
## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`. This plan binds it as follows.

- Instruction: "Do the next step of PLAN_NAME.md."
- Branch: `main`.
- Floor: <the app's list>, plus <conditional gate> for a step that touches
  <area>.
- Build log: §8. Last step: 4.
- A step reads, in order: `CLAUDE.md`, §2 and §3 of this plan, the step's own
  section in §4, and §8.
```
