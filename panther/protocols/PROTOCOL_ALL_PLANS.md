# Protocol: Plans

**Scope:** All

How to write a `PLAN_*.md` that an agent can execute over many steps without
supervision, and how the agent behaves. Each app binds it to its own branch and
floor (§0 below); each plan adds only the rules peculiar to itself. Small work
needs no plan file: a work list and a verification line are enough.

## The idea

A plan is a contract between contexts that share no memory. The whole
instruction to an agent is one sentence: **"Do the next step of PLAN_NAME.md."**
Everything the agent needs is in the file. What the plan says is decided before
work starts; git records what happened. A plan is transient: it mutates the
app's durable docs, and it is deleted when its work lands.

## The shape of a plan file

- **Header.** One paragraph, the **Next step** line, the branch, the repos
  touched, what to read first, and `Start when:` naming a fact an agent can
  check if the plan follows another.
- **§0 How to work this plan.** The bindings: the plan file's own name, for the
  one-sentence instruction; the branch; the repo of each step; the floor, named
  as the app's own docs name it (for panther, CLAUDE.md "Commands"); the log's
  section and the reading order for a step; the last step number; the vocabulary
  the plan uses, defined once; and any rule peculiar to this plan.
- **§1 The problem.** Why, grounded in the code, with file and line.
- **§2 The model.** The end state in the plan's own vocabulary.
- **§3 Rulings.** Numbered, decided. A ruling the author derived rather than
  heard is marked _(proposed)_ and stands unless overruled before `Do 1`. A plan
  that ships something states what and when as a ruling.
- **§4 Steps.** One section per step, with five parts in this order:
  **Surface**, every file the step may touch, which is what the review diffs
  against; **Deliverable**, what must be true in the code when the step is done;
  **Not in this step**, the neighbouring work a reader would expect here;
  **Gates**, on top of the floor; **Ends with**, one commit or several, each
  green.
- **§5 Out of scope.** Named, so it is not reopened.
- **§6 Log.** Departures. Numbering is a convention; §0 names the log's section.

## Start

Confirm the branch the plan names and that the tree is clean: a dirty tree means
another agent did not finish, so stop and say so. Never create a branch. Confirm
that the last commit naming the plan agrees with the **Next step** line: it
closed step N-1, or it is a partial of step N whose message says what is not
done. Then read, in the order the plan gives, only what the step requires.

## The cadence

Unless Tim says otherwise, a plan is done from start to finish by one agent,
which launches independent agents for the review steps. It works one step at a
time, named by the **Next step** line, and a step ends with the line moved, so
an agent whose context runs out mid-plan is resumed by the next with the same
instruction. Every commit of step N, its fix and its close included, has the
subject `PLAN_NAME step N: why`.

**Build.** Build step N as its section says, inside its Surface, until the
step's gates and the floor are green, and commit; where a step says "several
commits", each is green on its own. An agent that cannot finish commits what it
has, says in the message what is not done, and leaves the line unchanged.

**Review.** Spawn an independent review agent in a fresh context. It reads and
runs, never writes. Its instruction, and nothing else:

> Read PLAN_NAME.md from disk and the commits of step N
> (`git log --grep "PLAN_NAME step N"`). Check three things: nothing outside the
> step's Surface changed (every file outside it is a finding); every item of the
> step's Deliverable is in the code, read in the code and never in a commit
> message; every gate in the step's Gates and in the floor passes when you run
> it (a gate you cannot run is itself a finding). Read the whole surface once
> and report every defect in that one pass, each as a stated edit: file, line,
> the edit. Change nothing.

**Fix.** Apply every finding as stated. A finding is not argued with: one that
contradicts a ruling stops the plan with the question for Tim, and one whose
edit fails a gate is reported with the gate's output. Run the floor and the
step's gates, and commit.

**Re-review.** Spawn an independent re-review agent in a fresh context, with
this instruction: read the review's findings and the fix commit; check that each
stated edit landed and that the gates pass; report, and change nothing. It never
widens the review: a defect it sees outside the findings is reported, not fixed,
and does not hold the line. A review with no findings has no re-review.

**Close.** Move the **Next step** line to `Do N+1` and commit. After the last
step, delete the plan file in that commit instead, its residue moved to the
standing docs. When the steps after the last code step are not code, such as
deploys, that commit cuts the file to those steps and what they need, because
the standing docs now describe the code.

## What an agent may change in the plan

The **Next step** line, the log, and a fact shown wrong (a line number, a moved
file, a claim about the code), corrected in place, the commit subject saying so.
A ruling, a Surface or a Deliverable changes only on Tim's word.

## The log

A list of departures and nothing else: "built X instead of Y because Z", one
item each, written when it happens. Commit messages carry the rest, with what
has no other home in the body. A choice the rulings left open is written into
the DOC or a code comment in the step, never into the plan.

## Rules that bind every step

- **The step ends green.** The app's floor plus the step's own gates. Every gate
  is something a review agent can run: a script in the repo, a task, or a
  harness file the step committed. Never a one-off the agent ran and described.
- **Touch only the Surface the step names.** A typecheck error outside it is
  reported, not fixed; an unlisted cleanup waits for the step that lists it.
- **Where the plan and the code disagree, the code wins.** A ruling is overruled
  only by the person whose plan it is, in the rulings section, before the step
  that depends on it.
- **Docs move with the code.** Prose describing a contract the step changes is
  rewritten in the same step, never deferred to the closing step.
- **Nothing outside the plan cites it.** Code, comments and the standing docs
  never name a plan, a ruling, a section or a step: a comment that needs a
  reason states the reason. A citation outlives the plan and then points
  nowhere, and while the plan is open it makes a ruling the code has since moved
  past read as current.
- **One step at a time.** Commit with a message that says why.

## Findings not fixed

A defect found and not fixed goes, in the commit that finds it, to the plan that
owns the fix if one exists, else to `PLAN_DEFECTS.md` in the repo where the fix
lands, created if absent, one line each: file, line, defect, edit. An accepted
limit goes to the module DOC's Known limits. Never into the plan being worked,
nor into FUTURE_IDEAS, which is parked work.

## Plans in several repos

A plan whose steps run in several repos is one file. Each step names its repo. A
step in another repo is worked in that repo's directory: the agent reads that
repo's CLAUDE.md, runs its floor there, and commits there; the **Next step**
line moves in a commit where the plan lives. A sync step of a panther plan is
one commit per consumer, the hashes in the panther commit's body.
