# PLAN: Three onboarding and slide-editor bug fixes

Status: open. Three independent client fixes, found by the last review of
PLAN_PRODUCT_OWNERSHIP and confirmed in the code on 2026-10-08. Each is older
than that plan, which neither caused them nor depends on them.

Work it in one session on the current branch: one commit per fix, each green,
then delete this file in the last commit. Read first: `CLAUDE.md`,
`SYSTEM_14_client_shell.md` (onboarding tours) and
`SYSTEM_12_documents_sharing.md` (the slide editor).

---

## 1. The report intro tour stops on every FASTR report

**Where.** `client/src/onboarding/tours.ts`, `buildReportEditorIntroTour`, the
step `id: "download"` (target `#report-download-button`, no `when`).

**Defect.** `report.tsx` renders `#report-download-button` only when neither
File menu is shown (`!fileMenuShown() && !fileMenuAloneShown()`), so a FASTR
report, the format every new report gets, never has it: Download lives in its
File menu. roadtrip waits 8 s for the missing target, aborts the run and marks
every tour in it seen, so the report intro, figures and history tours are lost
on a user's first FASTR report. Markdown and html reports keep the header button
and no File menu.

**Change.** Two mutually exclusive steps in the slot the one step holds now:

- The `download` step gains
  `when: () => document.querySelector("#report-download-button") !== null`.
- A new step after it, `id: "file"`, targets `tourTarget("report-file-menu")`
  with
  `when: () => document.querySelector('[data-tour="report-file-menu"]') !== null`,
  `placement: "bottom"`, the title `Export and share` (`fr` "Exporter et
  partager", `pt` "Exportar e partilhar") and the body:
  - `en`: "File holds everything that acts on the whole report: Download (Word
    or PDF), Email this file, Make a copy and, if you can edit it, renaming it
    and managing who has access."
  - `fr`: "Fichier contient tout ce qui agit sur l'ensemble du rapport :
    Télécharger (Word ou PDF), Envoyer par email, Créer une copie et, si vous
    pouvez le modifier, le renommer et gérer qui y a accès."
  - `pt`: "Ficheiro contém tudo o que atua sobre todo o relatório: Descarregar
    (Word ou PDF), Enviar por email, Criar uma cópia e, se o puder editar,
    mudar-lhe o nome e gerir quem lhe tem acesso."
- `client/src/components/products/report/toolbar.tsx`: the `Popover` in
  `ReportFileMenu` gains `tour="report-file-menu"`, as `DeckFileMenu` carries
  `tour="deck-file-menu"`.

## 2. The slide tours never start on their own

**Where.** `client/src/onboarding/index.ts`, `setupTours`: the `pages` record
and the three `slide-cover`, `slide-section` and `slide-content` entries.

**Defect.** The manager keeps one page at a time, the first key of `pages` whose
predicate holds (`pageAccessorFrom`, roadtrip's `solid/index.js`). `deck-editor`
is listed before the slide pages and is true while a slide is open
(`editing_slide`), so the slide pages never become current and the three slide
tours run only from the tour catalogue. Listing the slide pages first is no fix:
a deck with slides always has one open, so the deck tours would then never
start.

**Change.**

- Remove `slide-cover`, `slide-section` and `slide-content` from `pages`.
- Register the three slide tours on `page: "deck-editor"`, each with
  `when: () => editingSlideOfType(type)` (which already requires
  `canEditProduct` on the open deck), placed after the present entry and before
  the history entry, so a merged run still ends on history and settings. The
  comment above them says why they share the deck's page: the rail stays on
  screen beside an open slide and the manager keeps one page at a time, so a
  page of their own would never win.
- Add the open slide's type to `watch` (`editing_slide` →
  `view.context.getTempSlide().type`), so a type change on the open slide
  re-checks the gates; a slide switch already does, because each slide editor
  sets the copilot view on mount.
- The replay chain starts a replay when its tour's page is active
  (`pages[page]()`), which for a slide tour would now be as soon as the deck
  opens, before `setPendingSlideOpen` opens a slide of the right type. Replace
  `pageForTour` with a map from tour id to the predicate a replay waits for:
  each slide tour maps to `() => editingSlideOfType(type)`, every other tour to
  `pages[entry.page]`. The effect tests that predicate where it tests
  `pages[page]()` today, and a tour id with no entry is still dropped.
- SYSTEM_14: the sentence saying the slide tours are pages keyed on
  `editing_slide` by the open slide's type now says they share the deck's page
  with an entry-level `when` on the open slide's type, and why; the sentence on
  controls a level hides says "the slide tours' `when` needs edit on the open
  deck" in place of "the slide tours' pages need edit on the open deck".

## 3. Dead code in the slide editor

**Where.**
`client/src/components/products/slide_deck/slide_editor/slide_editor.tsx`:
`updatingFigures` / `setUpdatingFigures` and `updateAllFiguresOnSlide`, with its
comment.

**Defect.** Nothing calls `updateAllFiguresOnSlide` or reads `updatingFigures`;
the deck header's Update all figures runs `updateAllDeckFigures` instead.

**Change.** Delete the signal, the function and its comment, and the
`updateFigureToScope` import, whose only use is in that function. `staleFigures`
stays: `selectedStaleBundle` reads it.

---

## Verification

`deno task typecheck` (fmt, server, client and the four lints) and
`./validate_protocols` with no new tier-2 entry, after each commit.
`grep -n "updateAllFiguresOnSlide\|updatingFigures\|updateFigureToScope" client/src/components/products/slide_deck/slide_editor/slide_editor.tsx`
prints nothing.
