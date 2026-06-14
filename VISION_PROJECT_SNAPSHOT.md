# Vision: The Self-Contained, Transportable Project

> The durable architectural direction. This is the *why* and the *end-state*;
> [PLAN_PROJECT_SNAPSHOT.md](PLAN_PROJECT_SNAPSHOT.md) is the *how* and the *when* (Step A
> of this vision, grounded in a verified inventory). When they disagree, this doc states
> intent; the plan states the current tactical path.

## Essence

A project should be a **fully self-contained, self-describing, transportable unit** — a
frozen snapshot that can be detached from the instance that produced it and attached to
another arbitrarily. Nothing a project *renders* should depend on live instance state.

## The problem it ends

Today a project's data depends on instance-level data and config that lives outside the
project and can change underneath it. An admin toggling a setting, re-uploading a boundary
file, or editing a label can silently change — or invalidate — what an existing project's
visualizations, reports, decks, and dashboards show, with no version bump and no cache
invalidation. The project is not a stable, reproducible, or portable thing; it is a live
view that can drift.

## Three layers, fully decoupled

1. **Instance data** — raw uploads, instance config, the shared structure master. The
   live source of truth, mutable by admins.
2. **Project snapshot** — the transportable unit. A frozen capture derived from layer 1.
3. **Artifacts** — visualizations, slide-decks, reports, dashboards (and AI over them).

**The one hard rule:** *layer 3 reads only from layer 2; layer 2 depends on nothing in
layer 1 at read time.* No viz / report / deck / dashboard reads instance data, period.

## The mental model: a snapshot is `(results inputs, results outputs)`

The project snapshot is best understood as a frozen **input→output pair** of the
module-execution closure — everything a computation *consumed* and everything it
*produced*, captured together at one version:

- **inputs** (two kinds, both must be captured):
  - *module-execution inputs* — integrated datasets, module parameters.
  - *presentation-time inputs* — structure (admin areas / facilities / indicators), config
    (e.g. which facility columns are enabled), labels, locale. These are read by the
    viz/query layer, not the R script, but they are inputs all the same.
- **outputs** — the results objects the modules produced (and derived indicators).

Artifacts then read **outputs for the data, inputs for the labels/structure/filters** —
both halves from the snapshot. Drift bugs are exactly the cases where an input was left in
layer 1 and read live (the canonical example: a config flag that gates query shape but was
never captured, so the cache serves a stale figure after an admin changes it).

## End-state properties

A layer-2 unit must be:

- **Self-contained** — carries every input it needs, including a resolved structure subset.
  No reach back into layer 1 at read time.
- **Identity-independent** — references structure/metrics by **snapshot-local stable ids**,
  not instance foreign keys, so it resolves no matter which instance it's attached to.
- **Self-describing** — carries its own schema/version + provenance (which instance/version
  it was derived from) so it can be validated on attach. Provenance is metadata, never read
  across the boundary at render time.
- **Versioned as a whole** — the snapshot is versioned by its input set; outputs are valid
  for exactly that input version; artifact caches version off the snapshot version. (This
  is the cache-coherence half: snapshotting relocates an input to project-local; the cache
  must still version on it, now uniformly from project-local stamps.)
- **Transportable** — serializable to a detachable form (zip / dump / logical export) and
  re-attachable to a project arbitrarily.

## This vision is already partly real

It is an extension of patterns the codebase already uses, not a green-field idea:

- **Datasets** are uploaded at instance level but snapshotted into the project DB with a
  project-local `last_updated` that every project cache versions off — the gold-standard
  shape this whole vision generalizes.
- **FigureBundle** makes *layer-3 artifacts* self-contained snapshots of their upstream
  (config + items + projection + frozen localization/geo). The project-snapshot vision is
  the same principle **one layer down**: make *layer 2* a self-contained snapshot of *its*
  upstream. Consistent mental model across the stack.

The work remaining is to bring the **stragglers** — instance inputs still read live by
project artifacts — under the same pattern, and then to make the resulting unit portable.

## The path (vision altitude — detail in the plan)

- **Step A** — close render/query-time drift: consume the input snapshots that already
  exist (or add small ones), and fold their project-local version stamps into the artifact
  caches. Closes the live-drift bug class. *(N1 from the S9 review lands here.)*
- **Step B** — structure self-containment with snapshot-local ids, and the large
  snapshots (boundary geometry, asset binaries). The real portability enabler.
- **Step C** — serialization, self-describing metadata, attach/detach mechanics. Meaningful
  only because A and B make the project DB the complete source.

Even in Step A: **never bake instance foreign keys into a project-side field** — Steps B/C
need snapshot-local ids, and that constraint must hold from the first change.

## Why it's worth it

- **Correctness** — ends a whole class of silent-drift bugs (the cache can't go stale on an
  input it owns).
- **Reproducibility** — a project shows the same thing regardless of later instance churn.
- **Portability** — a project becomes a thing you can move, archive, clone, and hand off.
- **Simplicity** — one uniform versioning model (everything versions off project-local
  stamps), instead of artifacts reaching cross-layer for individual inputs.
