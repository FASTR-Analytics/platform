# Webinar notes: The new results-package architecture

Framing: **a heads-up**, not a call to action. Rollout comes after the
webinar; existing projects migrate automatically and every chart keeps
working. Say **"results package"** (the UI term), never "run".

## Three key messages

1. Analysis now happens **once, at instance level**, producing a **results
   package** — a sealed snapshot of the data in, settings used, and results
   out. Projects attach to a package.
2. **A package never changes.** New data means a new package; each project
   switches deliberately, when ready.
3. **Day-to-day authoring is unchanged** — visualizations, decks, dashboards,
   reports, AI all work exactly as before.

---

## Part A — Slides

Each image in `slides/` comes as SVG (drag into PowerPoint, sharp at any
size) and high-res PNG. All 16:9, white background.

1. **Title** (text): *A new engine under FASTR: results packages.* Same
   platform, same charts — a rebuilt engine for producing and storing results.
2. **The change in one sentence** (text): *Analysis moves out of individual
   projects and into shared, sealed results packages any project can use.*
3. **Before** (`svg_01_before.svg`): every project held its own copy of the
   data, ran the full analysis itself, and results were rebuilt in place —
   duplicated storage, repeated processing, numbers that could shift silently.
4. **After** (`svg_02_after.svg`): data in (instance) → packages (analysis
   runs once, sealed and catalogued) → projects (pure authoring, reading from
   their attached package). One-way flow; no project can be stale.
5. **Inside a package** (`svg_03_package_anatomy.svg`): not just outputs —
   the exact data, settings, module versions, script and logs. A permanent
   answer to "where did this number come from?"
6. **New data never changes your project** (`svg_04_lifecycle.svg`): new
   quarter → new package; old one untouched. Projects switch with one click
   after an automatic compatibility check — or stay put.
7. **Before/after table** (`svg_05_before_after.svg`): emphasize two rows —
   numbers change only when you choose, and one package serves many projects.
8. **Why** (`svg_06_benefits.svg`): trust, speed, run-once-use-everywhere,
   transparency, lighter projects.
9. **What this means for you** (text): nothing to do now; rollout is
   coordinated per country; at upgrade each project gets a package with its
   current numbers. Afterwards: a Results packages catalogue (admins), a
   Results package tab in each project, and no more re-run buttons or
   out-of-date warnings.

---

## Part B — Demo script (10 min)

**Prep:** demo instance, logged in as instance admin. Two Ready packages
generated the day before — one attached to a demo project with a few
visualizations, a newer one (extra quarter of data) not attached. The live
generation launched mid-demo is never waited on; if it fails, narrate over
the finished packages.

**0:00 Catalogue.** Instance shell → **Results packages**. "Each row is a
sealed snapshot of data plus analysis results." Point out status
(Ready/Generating/Failed) and **In use by** — one package, several projects.

**1:00 Generate.** **Generate new results package** → Step 1 **Choose data**:
tick the data families (HMIS, HFA); each included family is captured **in
full** — the whole time period, all indicators, all facilities — so the
analysis always runs on everything → Step 2 **Configure modules**
(prerequisites handled for you) → Step 3 **Confirm and launch**: clear label,
note **Attach to projects**, then **Launch generation**. Show the live progress and log,
then move on: "real data takes a few minutes, so here's one I prepared."

**3:30 Transparency.** Open a Ready package: its modules and metrics, the
**Script** ("the exact R code that ran"), the **Logs**, the **Files**. "Six
months from now this still shows exactly what produced every number."

**5:30 Project side.** Open the demo project. A chart works as always. Open
the **Results package** tab — same explorer; "everything in this project
reads from this package." Note what's gone: no modules page, no re-run
buttons. Under **Other results packages**, pick the newer one → **Use this
results package** → compatibility check runs → confirm. The chart now shows
the new quarter. "One deliberate click, checked in advance, reversible."

**8:30 Wrap.** "Data comes in. Analysis runs once into a sealed package.
Projects attach and nothing changes until you choose." Then the heads-up:
rollout over the coming weeks, migration automatic, no action needed.

---

## Likely questions

- **Will my projects change at rollout?** No — each gets a package built
  from its existing results. Same numbers. New numbers only appear when a
  newer package is attached.
- **Who does what?** Admins generate packages; project editors attach/switch
  them; viewers just see what's in use.
- **What if a new package lacks something my charts use?** The compatibility
  check tells you first, per visualization; affected charts show a clear
  "not available" state, and you can switch back.
- **What happens when new data is uploaded?** Nothing, until an admin
  generates a new package. Uploads no longer touch projects.
- **Are old packages deleted?** Only by explicit admin action, never while
  in use. No automatic cleanup.
