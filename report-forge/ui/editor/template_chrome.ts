// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// A page template's part of the live preview that is not the document: the
// press on an empty stats, cards, table or figure area that starts it, and
// the page's problems (the validator's and the measured ones), published
// for the toolbar, which holds every template control (Layout, the area
// the caret is in, Add item). Nothing is drawn over the page. An empty
// text area's ghost line and an empty photo area are the live preview's
// own (attachSlotTextGhosts, attachPhotoSlots).

import type { EditorView } from "@codemirror/view";
import {
  addPageSlotItemEdit,
  type EditResult,
  FASTR_TEMPLATE_FILL_SHARE,
  type FastrPageIssue,
  fastrTemplateFill,
  fastrTemplateOverflow,
  fillPageSlotEdit,
  scanFastrPages,
  tableSnippet,
} from "../../engine/mod.ts";
import { t3 } from "../../engine/i18n.ts";
import type { EmbedResolver } from "./embed_resolver.ts";
import {
  fastrTemplateAddItemLabel,
  fastrTemplateAreaLabel,
} from "./fastr_block_labels.ts";

// What a new item starts with (addPageSlotItemEdit).
export function slotItemText() {
  return {
    statLabel: t3({ en: "New stat", fr: "Nouveau chiffre", pt: "Novo número" }),
    card: t3({ en: "Text", fr: "Texte", pt: "Texto" }),
    paragraph: t3({
      en: "New item",
      fr: "Nouvel élément",
      pt: "Novo elemento",
    }),
  };
}

// The page's own problems, in the user's words: what the AI validator
// says to the model (scanFastrPages), for a person.
function issueText(issue: FastrPageIssue): string {
  switch (issue.kind) {
    case "missing-slot":
      return `${
        t3({
          en: "Missing area:",
          fr: "Zone manquante :",
          pt: "Área em falta:",
        })
      } ${fastrTemplateAreaLabel(issue.slot)}`;
    case "missing-main":
      return t3({
        en: "No main text",
        fr: "Pas de texte principal",
        pt: "Sem texto principal",
      });
    case "count": {
      const range = issue.max === undefined
        ? `${issue.min ?? 0}+`
        : `${issue.min ?? 0}–${issue.max}`;
      return `${fastrTemplateAreaLabel(issue.slot)}: ${issue.n} · ${
        t3({ en: "takes", fr: "accepte", pt: "aceita" })
      } ${range}`;
    }
    case "embeds":
      return `${fastrTemplateAreaLabel(issue.slot)}: ${
        t3({
          en: "one image or figure only",
          fr: "une seule image ou figure",
          pt: "apenas uma imagem ou figura",
        })
      }`;
    case "main-split":
      return t3({
        en: "The main text is split by an area",
        fr: "Le texte principal est coupé par une zone",
        pt: "O texto principal está dividido por uma área",
      });
    case "slot-twice":
      return `${fastrTemplateAreaLabel(issue.slot)}: ${
        t3({
          en: "appears twice",
          fr: "apparaît deux fois",
          pt: "aparece duas vezes",
        })
      }`;
    case "slot-unknown":
      return `${
        t3({
          en: "Not an area of this layout:",
          fr: "Zone inconnue de cette mise en page :",
          pt: "Área que esta disposição não tem:",
        })
      } ${issue.slot ?? "?"}`;
    case "other":
      return issue.message;
  }
}

function overfullText(area: string): string {
  return `${fastrTemplateAreaLabel(area)}: ${
    t3({
      en: "holds more than it shows",
      fr: "contient plus qu'elle n'affiche",
      pt: "contém mais do que mostra",
    })
  }`;
}

function underfilledText(share: number): string {
  return t3({
    en: `Content reaches ${Math.round(share * 100)}% down the page`,
    fr: `Le contenu s'arrête à ${Math.round(share * 100)} % de la page`,
    pt: `O conteúdo chega a ${Math.round(share * 100)}% da página`,
  });
}

export type TemplateChrome = {
  // Re-measure the page's problems (after any change to the areas' boxes).
  measure: () => void;
};

// The chrome for the template region `dom` renders (its first line is
// 0-based document line `startLine`, its source `source`).
export function attachTemplateChrome(opts: {
  dom: HTMLElement;
  view: EditorView;
  startLine: number;
  source: string;
  resolver: EmbedResolver;
}): TemplateChrome | undefined {
  const { dom, view, startLine, source } = opts;
  const tpl = dom.querySelector<HTMLElement>(":scope .fm-tpl");
  const scan = scanFastrPages(source);
  const page = scan.pages[0];
  if (tpl === null || page === undefined) return undefined;

  // Lines: the scan's are 1-based in the region's source; the document's
  // are the region's 0-based start plus that.
  const docLine = (rel1: number) => startLine + rel1;
  const run = (edit: (doc: string) => EditResult) => {
    if (view.state.readOnly) return;
    const r = edit(view.state.doc.toString());
    if (r.changes.length > 0) view.dispatch({ changes: r.changes });
  };
  const press = (el: HTMLElement, onPress: () => void) => {
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      onPress();
    });
    el.addEventListener("click", (e) => e.stopPropagation());
  };

  // ── The page's problems ──
  // The validator's, from the source, and the measured ones (an area
  // holding more than it shows, a page left part empty), which change with
  // the boxes. The toolbar's Layout control lists them: they are published
  // on the widget and announced when they change.
  const issues = scan.issues.filter((i) =>
    i.line >= page.line && i.line <= (page.endLine ?? Infinity)
  );
  let measured: string[] = [];
  let published = "";
  const publish = (announce: boolean) => {
    const list = [...issues.map(issueText), ...measured];
    const key = list.join("\n");
    (dom as unknown as { _fmTplProblems?: string[] })._fmTplProblems = list;
    if (key === published) return;
    published = key;
    if (announce) {
      dom.dispatchEvent(
        new CustomEvent(FASTR_TEMPLATE_STATUS_EVENT, { bubbles: true }),
      );
    }
  };

  // ── Empty areas ──
  // An empty area whose content is not typed: a press starts it. Each says
  // what goes there, startable or not (a host with no figures).
  for (const slot of page.slots) {
    if (slot.name === undefined || !slot.empty) continue;
    const el = tpl.querySelector<HTMLElement>(
      `:scope > .fm-tpl-slot[data-line="${slot.line - 1}"]`,
    );
    if (el === null) continue;
    const slotLine = docLine(slot.line);
    const accepts = slot.spec?.accepts;
    if (accepts !== "media") {
      el.setAttribute("data-fm-placeholder", fastrTemplateAreaLabel(slot.name));
    }
    if (view.state.readOnly) continue;
    const start = accepts === "stats" || accepts === "cards"
      ? () => run((doc) => addPageSlotItemEdit(doc, slotLine, slotItemText()))
      : accepts === "table"
      ? () => run((doc) => fillPageSlotEdit(doc, slotLine, tableSnippet(3, 3)))
      : accepts === "figure" && opts.resolver.onAddFigure !== undefined
      ? () => opts.resolver.onAddFigure?.(slotLine, el.getBoundingClientRect())
      : undefined;
    if (start === undefined) continue;
    el.classList.add("fm-tpl-slot--start");
    el.setAttribute(
      "data-fm-placeholder",
      accepts === "figure"
        ? t3({
          en: "Add a visualization",
          fr: "Ajouter une visualisation",
          pt: "Adicionar uma visualização",
        })
        : accepts === "table"
        ? t3({
          en: "Add a table",
          fr: "Ajouter un tableau",
          pt: "Adicionar uma tabela",
        })
        : fastrTemplateAddItemLabel(
          slot.name,
          accepts === "stats" ? "stats" : "cards",
        ),
    );
    press(el, start);
  }

  // Measured, as print's page map measures them.
  const measure = () => {
    if (!tpl.isConnected) return;
    const over = fastrTemplateOverflow(tpl).map((o) => overfullText(o.area));
    const fill = fastrTemplateFill(tpl);
    measured = fill < FASTR_TEMPLATE_FILL_SHARE
      ? [...over, underfilledText(fill)]
      : over;
    publish(true);
  };
  publish(false);
  return { measure };
}

// Announced (bubbling, from the template's widget) when a page's problems
// change; templateProblemsOf reads them off the widget.
export const FASTR_TEMPLATE_STATUS_EVENT = "fm-template-status";

export function templateProblemsOf(widget: Element): string[] {
  return (widget as unknown as { _fmTplProblems?: string[] })._fmTplProblems ??
    [];
}

// The paragraph just written at document offset `at` (the toolbar's Add
// item), opened to type over: its island, on the rebuilt widget of the
// template region whose first line is 0-based `startLine`.
export function openNewParagraph(
  view: EditorView,
  startLine: number,
  at: number,
): void {
  if (at > view.state.doc.length) return;
  const rel = view.state.doc.lineAt(at).number - 1 - startLine;
  const host = view.contentDOM.querySelector(
    `[data-region-line="${startLine}"]`,
  );
  const el = host?.querySelector<HTMLElement>(`p[data-line="${rel}"]`);
  const activate = (el as unknown as
    | { _fmActivate?: (caretAt?: number) => void }
    | null
    | undefined)?._fmActivate;
  if (el === null || el === undefined || activate === undefined) return;
  activate();
  globalThis.getSelection()?.selectAllChildren(el);
}
