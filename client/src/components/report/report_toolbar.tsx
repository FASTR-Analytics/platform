import {
  FASTR_BLOCK_SNIPPETS,
  FASTR_INK_ROLES,
  FASTR_REPORT_THEMES,
  FASTR_THEME_TOKENS,
  FASTR_TONES,
  type FastrBlockName,
  type FastrFencePatch,
  type FastrInkRole,
  type FastrOpenFence,
  type FastrReportTheme,
  type FastrThemeColorOverride,
  type FastrTone,
  buildFastrCoverTileCss,
  buildFastrReportCss,
  coverSnippet,
  FASTR_COVER_LAYOUTS,
  FASTR_COVER_PRESETS,
  FASTR_TOC_DEFAULT_DEPTH,
  type FastrCoverPreset,
  isFastrBlockName,
  cardTilesSnippet,
  columnsSnippet,
  renderFastrMarkdownToHtml,
  statTilesSnippet,
  STEPS_MAX_PICK,
  stepsSnippet,
  t3,
  TILES_MAX_COLS,
} from "lib";
import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { Button, COLOR_SETS, Icon } from "panther";
import { fastrThemeLabel } from "~/components/_shared/fastr_theme_labels";
import {
  fastrBlockLabel,
  fastrCoverLayoutLabel,
  fastrRoleLabel,
  fastrToneLabel,
} from "~/components/_shared/fastr_block_labels";
import type { ReportBlockContext, ReportEditorApi } from "./report_editor";

// The FASTR Markdown toolbar, under the report header — laid out like Google
// Docs: a MENU row (Insert and Page open dropdown menus) above ONE persistent
// toolbar row. The toolbar row adapts to what was last clicked: an embed's
// controls replace the text controls while a figure/image is selected, and a
// block segment (the fence's own attributes) appends while the caret sits
// inside a `:::` block — the text controls stay, since the caret is still in
// text.
//
// Every control writes a role name, never a colour; the one exception is the
// literal background picker, which says so. The toolbar row is Google Docs'
// PILL: one rounded tinted strip of flat buttons (hover tint, primary-subtle
// fill when active) in thin-divided groups, dropdowns marked by a chevron,
// text size as a − N + stepper. Panther has no bold/italic/heading glyph in
// its IconName union and cannot be modified here, so those buttons use
// letterforms — the same answer the slide editor's TextStylePopover reached.
// No inline-code button: reports have no use for it (backticks still render
// if typed; the toggle stays in the editor API).

type Props = {
  api: () => ReportEditorApi | undefined;
  context: () => ReportBlockContext | undefined;
  theme: () => FastrReportTheme;
  colors: () => FastrThemeColorOverride | undefined;
  // The `:::report` page-setup header — edited from the Page menu, since the
  // line itself is invisible in the editor (its widget is hidden and atomic).
  pageSetup: () => FastrOpenFence | undefined;
  onPatchPageSetup: (patch: FastrFencePatch) => void;
  // The document's THEME — the whole design, so it belongs in the Page menu
  // beside the background rather than in the header's crowded right slot.
  onSelectTheme: (theme: FastrReportTheme) => void;
  // Pick or upload an image to use as the PAGE ground; resolves to its id.
  onPickPageImage: () => Promise<string | undefined>;
  documentStats: () => {
    words: number;
    headings: number;
    figures: number;
    images: number;
    lastSaved: string;
  };
  // Embeds: inserts ride the Insert menu; a selected embed's controls replace
  // the toolbar row (slot, so the toolbar stays embed-agnostic).
  embedKind: () => "figure" | "image" | undefined;
  embedControls?: JSX.Element;
  canInsertEmbeds: () => boolean;
  onInsertFigure: () => void;
  onInsertImage: () => void;
  // The File menu's actions — whole-document operations the host owns (they
  // open modals over the editor), so the toolbar only names them.
  onDownload: () => void;
  onEmail: () => void;
  onRename: () => void;
  onDuplicate: () => void;
};

// Blocks whose fence the toolbar offers to edit, and the enumerated attributes
// each one carries. Text-valued attributes (title, kicker, cite, a stat's
// value) are deliberately absent: a live input would rewrite the fence — a
// Y.Text op and an undo entry — on every keystroke of a STRUCTURAL line, and
// they are easier to type in the fence itself, which is right there.
type ChoiceControl = {
  attr: string;
  label: string;
  options: { value: string; label: string }[];
  // What the block does when the attribute is absent.
  fallback: string;
};

function choiceControlsFor(name: FastrBlockName): ChoiceControl[] {
  const counts = (n: number) =>
    Array.from({ length: 4 }, (_, i) => ({
      value: String(i + 1),
      label: String(i + 1),
    })).slice(0, n);
  switch (name) {
    case "callout":
      return [{
        attr: "kind",
        label: t3({ en: "Kind", fr: "Type", pt: "Tipo" }),
        fallback: "note",
        options: [
          { value: "note", label: t3({ en: "Note", fr: "Remarque", pt: "Nota" }) },
          { value: "info", label: t3({ en: "Info", fr: "Info", pt: "Info" }) },
          {
            value: "success",
            label: t3({ en: "Good news", fr: "Bonne nouvelle", pt: "Boas notícias" }),
          },
          {
            value: "warning",
            label: t3({ en: "Caution", fr: "Prudence", pt: "Atenção" }),
          },
          {
            value: "danger",
            label: t3({ en: "Bad news", fr: "Mauvaise nouvelle", pt: "Más notícias" }),
          },
        ],
      }];
    case "tiles":
      return [{
        attr: "cols",
        label: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
        fallback: "3",
        options: counts(4),
      }];
    case "columns":
      return [{
        attr: "cols",
        label: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
        fallback: "2",
        options: counts(4),
      }];
    case "col":
      return [{
        attr: "span",
        label: t3({ en: "Span", fr: "Étendue", pt: "Extensão" }),
        fallback: "1",
        options: counts(4),
      }];
    case "stat":
      return [{
        attr: "dir",
        label: t3({ en: "Change", fr: "Évolution", pt: "Variação" }),
        fallback: "flat",
        options: [
          { value: "up", label: t3({ en: "Up", fr: "Hausse", pt: "Subida" }) },
          { value: "down", label: t3({ en: "Down", fr: "Baisse", pt: "Descida" }) },
          { value: "flat", label: t3({ en: "Flat", fr: "Stable", pt: "Estável" }) },
        ],
      }];
    // `report` is unreachable here — its line is hidden and atomic, and the
    // Page menu edits it instead.
    case "cover":
      return [{
        attr: "layout",
        label: t3({ en: "Layout", fr: "Mise en page", pt: "Disposição" }),
        fallback: "classic",
        options: FASTR_COVER_LAYOUTS.map((l) => ({
          value: l,
          label: fastrCoverLayoutLabel(l),
        })),
      }];
    case "contents":
      return [{
        attr: "depth",
        label: t3({ en: "Depth", fr: "Profondeur", pt: "Profundidade" }),
        fallback: String(FASTR_TOC_DEFAULT_DEPTH),
        options: counts(4),
      }];
    case "report":
    case "card":
    case "quote":
    case "band":
    case "steps":
      return [];
  }
}

// `:::report` sets the PAGE background, so its attribute is `background`.
function toneAttrFor(name: string): string {
  return name === "report" ? "background" : "tone";
}

export function ReportToolbar(p: Props) {
  // The block the block segment acts on: the fence on the caret's own line
  // when there is one (that is the only way a leaf block like `:::stat` is
  // ever reachable), otherwise the innermost block enclosing it. The
  // `:::report` header is NEVER a target — its line is hidden (the caret can
  // sit at doc start beside it) and the Page menu owns it.
  const target = createMemo<FastrOpenFence | undefined>(() => {
    const ctx = p.context();
    if (!ctx) return undefined;
    const fence = ctx.fenceHere ?? ctx.stack[ctx.stack.length - 1];
    return fence?.name === "report" ? undefined : fence;
  });

  const targetName = createMemo<FastrBlockName | undefined>(() => {
    const name = target()?.name;
    return name !== undefined && isFastrBlockName(name) ? name : undefined;
  });

  const marks = () => p.context()?.marks;

  function patch(attr: string, value: string | undefined) {
    const t = target();
    if (t) p.api()?.setBlockAttrs(t.line, { [attr]: value });
  }

  // Ground changes touch BOTH attrs (tone and bg are mutually exclusive — a
  // literal wins over a tone in the renderer, so a stale one must not linger)
  // in ONE fence rewrite: one Y.Text op, one undo entry.
  function patchGround(attrs: FastrFencePatch) {
    const t = target();
    if (t) p.api()?.setBlockAttrs(t.line, attrs);
  }

  function attrValue(attr: string): string | undefined {
    const v = target()?.attrs[attr];
    return typeof v === "string" ? v : v === true ? "" : undefined;
  }

  // The swatches render the REAL stylesheet under a private scope, so a tone
  // preview is the rule that will actually paint the report rather than a
  // colour guessed in JS (fm-tone--accent is a color-mix, which JS cannot
  // reproduce). The scope root also paints --fm-page and --fm-ink, so every
  // swatch shows the DOCUMENT's colours whatever the app's own theme is doing.
  const scopeClass = `fm-tb-${createUniqueId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const swatchCss = createMemo(() =>
    buildFastrReportCss(p.theme(), p.colors(), `.${scopeClass}`, {
      omitFontImport: true,
    }) + buildFastrCoverTileCss(`.${scopeClass}`)
  );

  // Page-setup attribute accessors — the `:::report` fence's attrs, with the
  // tone/literal duality resolved (`background` takes either; `bg` a literal).
  const psAttr = (k: string): string | undefined => {
    const v = p.pageSetup()?.attrs[k];
    return typeof v === "string" ? v : v === true ? "" : undefined;
  };
  const psTone = (): string => {
    const v = (psAttr("background") ?? psAttr("bg"))?.toLowerCase();
    if (v === undefined) return "default";
    return (FASTR_TONES as readonly string[]).includes(v) ? v : "literal";
  };
  const psLiteral = (): string | undefined => {
    const bg = psAttr("bg");
    if (bg !== undefined && !(FASTR_TONES as readonly string[]).includes(bg.toLowerCase())) {
      return bg;
    }
    const background = psAttr("background");
    return background !== undefined &&
        !(FASTR_TONES as readonly string[]).includes(background.toLowerCase())
      ? background
      : undefined;
  };

  // The page ground as an image: `bg=image:<id>`.
  const psImageId = (): string | undefined => {
    const bg = psAttr("bg") ?? psAttr("background");
    const m = bg === undefined ? null : /^image:(.+)$/.exec(bg.trim());
    return m ? m[1] : undefined;
  };

  // The size the box shows: an explicit mark's size, else the RENDERED size
  // measured at the caret (rounded, as Google Docs shows whole points).
  const shownSize = (): number | undefined => {
    const explicit = marks()?.size;
    if (explicit !== undefined) return explicit;
    const measured = p.context()?.fontSizePt;
    return measured === undefined ? undefined : Math.round(measured);
  };
  // Step from what the box shows, so + on a 26pt heading gives 27, never 13.
  const stepSize = (delta: number) => {
    const cur = shownSize() ?? 12;
    const next = Math.max(1, Math.min(400, Math.round((cur + delta) * 10) / 10));
    p.api()?.setInlineSize(next);
  };

  const headingStyleFace = () => {
    const level = marks()?.headingLevel ?? 0;
    return level === 0
      ? t3({ en: "Normal text", fr: "Texte normal", pt: "Texto normal" })
      : `${t3({ en: "Heading", fr: "Titre", pt: "Título" })} ${level}`;
  };

  return (
    <div data-cursor-zone="header" data-tour="report-format-toolbar">
      <style>{swatchCss()}</style>

      {/* ── Menu row, Google Docs style ────────────────────────────────── */}
      <div class="flex flex-wrap items-center gap-1 px-2 pt-0.5">
        {/* File: the whole-document operations, as in Google Docs' File
            menu. Download moved here from the header. */}
        <Popover
          menu
          label={t3({ en: "File", fr: "Fichier", pt: "Ficheiro" })}
          title={t3({ en: "File", fr: "Fichier", pt: "Ficheiro" })}
        >
          {(close) => (
            <div class="ui-spy-sm flex w-56 flex-col">
              <PopoverRow
                active={false}
                onClick={() => {
                  p.onDownload();
                  close();
                }}
              >
                {t3({ en: "Download…", fr: "Télécharger…", pt: "Transferir…" })}
              </PopoverRow>
              <PopoverRow
                active={false}
                onClick={() => {
                  p.onEmail();
                  close();
                }}
              >
                {t3({ en: "Email this file…", fr: "Envoyer par email…", pt: "Enviar por email…" })}
              </PopoverRow>
              <MenuDivider />
              <PopoverRow
                active={false}
                onClick={() => {
                  p.onRename();
                  close();
                }}
              >
                {t3({ en: "Rename…", fr: "Renommer…", pt: "Mudar o nome…" })}
              </PopoverRow>
              <PopoverRow
                active={false}
                onClick={() => {
                  p.onDuplicate();
                  close();
                }}
              >
                {t3({ en: "Make a copy…", fr: "Créer une copie…", pt: "Criar uma cópia…" })}
              </PopoverRow>
            </div>
          )}
        </Popover>
        <Popover
          menu
          label={t3({ en: "Insert", fr: "Insérer", pt: "Inserir" })}
          title={t3({ en: "Insert", fr: "Insérer", pt: "Inserir" })}
          tour="report-insert-buttons"
        >
          {(close) => (
            <div class="ui-spy-sm flex w-56 flex-col">
              <For each={FASTR_BLOCK_SNIPPETS.filter((r) => r.name !== "report")}>
                {(row) => (
                  <Switch
                    fallback={
                      <PopoverRow
                        active={false}
                        onClick={() => {
                          p.api()?.insertBlockOnNewLine(row.snippet);
                          close();
                        }}
                      >
                        {fastrBlockLabel(row.name)}
                      </PopoverRow>
                    }
                  >
                  {/* Cover page opens a flyout of the cover compositions,
                      each thumbnail the REAL cover under the current theme. */}
                  <Match when={row.name === "cover"}>
                    <MenuFlyout label={fastrBlockLabel(row.name)}>
                      <CoverPicker
                          scopeClass={scopeClass}
                          onPick={(preset) => {
                            p.api()?.insertBlockOnNewLine(
                              coverSnippet(preset, {
                                kicker: t3({
                                  en: "Organisation · Period",
                                  fr: "Organisation · Période",
                                  pt: "Organização · Período",
                                }),
                                title: t3({
                                  en: "Report title",
                                  fr: "Titre du rapport",
                                  pt: "Título do relatório",
                                }),
                                sub: t3({
                                  en: "What this report covers, and for whom",
                                  fr: "Ce que couvre ce rapport, et pour qui",
                                  pt: "O que este relatório cobre, e para quem",
                                }),
                              }),
                            );
                          close();
                        }}
                      />
                    </MenuFlyout>
                  </Match>
                  <Match
                    when={row.name === "stat" || row.name === "tiles" ||
                      row.name === "columns" || row.name === "steps"}
                  >
                    {/* Stat, the card grid, Columns and Steps open a count
                        flyout, like Table's grid: hover picks how many
                        (across, or steps down), a click inserts the block. */}
                    <MenuFlyout label={fastrBlockLabel(row.name)}>
                      <TilesPicker
                          max={row.name === "steps" ? STEPS_MAX_PICK : undefined}
                          caption={row.name === "steps"
                            ? (n) =>
                              n === 1
                                ? t3({ en: "1 step", fr: "1 étape", pt: "1 passo" })
                                : `${n} ${t3({ en: "steps", fr: "étapes", pt: "passos" })}`
                            : undefined}
                          onPick={(n) => {
                            p.api()?.insertBlockOnNewLine(
                              row.name === "stat"
                                ? statTilesSnippet(
                                  n,
                                  t3({ en: "Stat", fr: "Chiffre", pt: "Indicador" }),
                                )
                                : row.name === "tiles"
                                ? cardTilesSnippet(
                                  n,
                                  t3({ en: "Card", fr: "Carte", pt: "Cartão" }),
                                  t3({ en: "Text", fr: "Texte", pt: "Texto" }),
                                )
                                : row.name === "columns"
                                ? columnsSnippet(
                                  n,
                                  t3({ en: "Text", fr: "Texte", pt: "Texto" }),
                                )
                                : stepsSnippet(
                                  n,
                                  t3({ en: "Step", fr: "Étape", pt: "Passo" }),
                                ),
                            );
                          close();
                        }}
                      />
                    </MenuFlyout>
                  </Match>
                  </Switch>
                )}
              </For>
              <MenuDivider />
              <PopoverRow
                active={false}
                onClick={() => {
                  p.api()?.insertLink();
                  close();
                }}
              >
                {t3({ en: "Link", fr: "Lien", pt: "Ligação" })}
              </PopoverRow>
              {/* Table opens a grid picker flyout, Google Docs style: hover
                  sets the size, a click inserts. */}
              <MenuFlyout label={t3({ en: "Table", fr: "Tableau", pt: "Tabela" })}>
                <TableGridPicker
                  onPick={(cols, rows) => {
                    p.api()?.insertTable(cols, rows);
                    close();
                  }}
                />
              </MenuFlyout>
              <Show when={p.canInsertEmbeds()}>
                <MenuDivider />
                <PopoverRow
                  active={false}
                  onClick={() => {
                    p.onInsertFigure();
                    close();
                  }}
                >
                  {t3({
                    en: "Visualization…",
                    fr: "Visualisation…",
                    pt: "Visualização…",
                  })}
                </PopoverRow>
                <PopoverRow
                  active={false}
                  onClick={() => {
                    p.onInsertImage();
                    close();
                  }}
                >
                  {t3({ en: "Image…", fr: "Image…", pt: "Imagem…" })}
                </PopoverRow>
              </Show>
            </div>
          )}
        </Popover>

        <Popover
          menu
          label={t3({ en: "Page", fr: "Page", pt: "Página" })}
          title={t3({ en: "Page setup", fr: "Mise en page", pt: "Configuração da página" })}
        >
          {(close) => (
            <div class="ui-spy-sm flex w-56 flex-col">
              {/* Theme and Background open flyouts, the way Insert's pickers
                  do: the menu stays one short list of names. */}
              <MenuFlyout label={t3({ en: "Theme", fr: "Thème", pt: "Tema" })}>
                {/* A FASTR body carries no CSS, so re-theming is safe at any
                    time. Each tile is the theme's own palette and heading
                    face, drawn straight from its tokens. */}
                <div class="bg-base-100 ui-pad-sm shadow-floating max-h-80 w-64 overflow-y-auto rounded border">
                  <div class="grid grid-cols-2 gap-1">
                    <For each={FASTR_REPORT_THEMES}>
                      {(theme) => (
                        <button
                          type="button"
                          class="ui-hoverable-base-200 flex flex-col gap-1 rounded p-1 text-left"
                          classList={{ "bg-primary-subtle": p.theme() === theme }}
                          onClick={() => {
                            p.onSelectTheme(theme);
                            close();
                          }}
                        >
                          <ThemeChip theme={theme} />
                          <span class="truncate text-xs">
                            {fastrThemeLabel(theme)}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </MenuFlyout>
              <MenuFlyout
                label={t3({ en: "Background", fr: "Fond", pt: "Fundo" })}
              >
                <div class="bg-base-100 ui-pad-sm shadow-floating rounded border">
                  <GroundPanel
                    scopeClass={scopeClass}
                    tone={psTone()}
                    literal={psLiteral()}
                    onTone={(tone) =>
                      p.onPatchPageSetup({
                        background: tone === "default" ? undefined : tone,
                        bg: undefined,
                      })}
                    onLiteral={(color) =>
                      p.onPatchPageSetup({ bg: color, background: undefined })}
                    onPick={close}
                  />
                  {/* A PHOTO as the page ground, with the overlay that keeps
                      text legible on it — the format's `bg=image:<id>`. */}
                  <div class="border-base-300 mt-2 border-t pt-2">
                    <div class="text-base-content-muted pb-1 text-xs">
                      {t3({ en: "Image", fr: "Image", pt: "Imagem" })}
                    </div>
                    <div class="ui-gap-sm flex items-center">
                      <Button
                        size="sm"
                        outline
                        iconName="photo"
                        onClick={async () => {
                          const id = await p.onPickPageImage();
                          if (id === undefined) return;
                          p.onPatchPageSetup({
                            bg: `image:${id}`,
                            background: undefined,
                          });
                          close();
                        }}
                      >
                        {t3({ en: "Choose…", fr: "Choisir…", pt: "Escolher…" })}
                      </Button>
                      <Show when={psImageId() !== undefined}>
                        <Button
                          size="sm"
                          outline
                          intent="danger"
                          iconName="trash"
                          onClick={() => {
                            p.onPatchPageSetup({ bg: undefined, overlay: undefined });
                            close();
                          }}
                        />
                      </Show>
                    </div>
                    <Show when={psImageId() !== undefined}>
                      <div class="text-base-content-muted pt-2 pb-1 text-xs">
                        {t3({ en: "Overlay", fr: "Voile", pt: "Sobreposição" })}
                      </div>
                      <For each={["dark", "light", "none"] as const}>
                        {(mode) => (
                          <PopoverRow
                            active={(psAttr("overlay") ?? "dark") === mode}
                            onClick={() => p.onPatchPageSetup({ overlay: mode })}
                          >
                            {mode === "dark"
                              ? t3({ en: "Darken", fr: "Assombrir", pt: "Escurecer" })
                              : mode === "light"
                              ? t3({ en: "Lighten", fr: "Éclaircir", pt: "Clarear" })
                              : t3({ en: "None", fr: "Aucun", pt: "Nenhuma" })}
                          </PopoverRow>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>
              </MenuFlyout>
              <PopoverRow
                active={psAttr("numbering") === "sections"}
                onClick={() =>
                  p.onPatchPageSetup({
                    numbering: psAttr("numbering") === "sections" ? undefined : "sections",
                  })}
              >
                <span class="flex-1">
                  {t3({ en: "Numbered sections", fr: "Sections numérotées", pt: "Secções numeradas" })}
                </span>
                <Show when={psAttr("numbering") === "sections"}>
                  <Icon iconName="check" class="h-3.5 w-3.5" />
                </Show>
              </PopoverRow>
              <MenuFlyout
                label={t3({ en: "Document details", fr: "Détails du document", pt: "Detalhes do documento" })}
              >
                <div class="bg-base-100 ui-pad-sm shadow-floating w-56 rounded border">
                  <DetailRows stats={p.documentStats()} />
                </div>
              </MenuFlyout>
            </div>
          )}
        </Popover>
      </div>

      {/* ── The toolbar row: text controls, block segment, or the selected
             embed's controls (which replace the text controls, as selecting
             an image does in Google Docs) ─────────────────────────────────── */}
      <div class="px-2 pt-1 pb-2">
        <div class="bg-base-200 flex flex-wrap items-center gap-0.5 rounded-full px-3 py-1">
        <Show
          when={p.embedKind() === undefined}
          fallback={
            <div class="ui-gap-sm flex flex-wrap items-center">
              {p.embedControls}
            </div>
          }
        >
          {/* Undo / redo lead the pill, as in Google Docs. The report
              header carries its own pair for the other formats only. */}
          <div class="flex items-center gap-0.5">
            <ToolButton
              label={t3({ en: "Undo", fr: "Annuler", pt: "Anular" })}
              onClick={() => p.api()?.undo()}
            >
              <Icon iconName="undo" class="h-4 w-4" />
            </ToolButton>
            <ToolButton
              label={t3({ en: "Redo", fr: "Rétablir", pt: "Refazer" })}
              onClick={() => p.api()?.redo()}
            >
              <Icon iconName="redo" class="h-4 w-4" />
            </ToolButton>
          </div>

          <Divider />

          <div class="flex items-center gap-0.5">
            <Popover
              label={<span class="w-24 truncate text-left">{headingStyleFace()}</span>}
              title={t3({ en: "Text style", fr: "Style de texte", pt: "Estilo de texto" })}
            >
              {(close) => (
                <div class="ui-spy-sm flex flex-col">
                  <For each={[0, 1, 2, 3, 4]}>
                    {(level) => (
                      <PopoverRow
                        active={(marks()?.headingLevel ?? 0) === level}
                        onClick={() => {
                          p.api()?.setHeadingLevel(level);
                          close();
                        }}
                      >
                        {level === 0
                          ? t3({ en: "Normal text", fr: "Texte normal", pt: "Texto normal" })
                          : `${t3({ en: "Heading", fr: "Titre", pt: "Título" })} ${level}`}
                      </PopoverRow>
                    )}
                  </For>
                </div>
              )}
            </Popover>
          </div>

          <Divider />

          <div class="flex items-center gap-0.5">
            <ToolButton
              active={() => marks()?.bold === true}
              onClick={() => p.api()?.toggleInlineMark("**", "**")}
              label={t3({ en: "Bold", fr: "Gras", pt: "Negrito" })}
            >
              <span class="font-700">B</span>
            </ToolButton>
            <ToolButton
              active={() => marks()?.italic === true}
              onClick={() => p.api()?.toggleInlineMark("*", "*")}
              label={t3({ en: "Italic", fr: "Italique", pt: "Itálico" })}
            >
              <span class="italic">I</span>
            </ToolButton>
            <ToolButton
              active={() => marks()?.underline === true}
              onClick={() => p.api()?.setInlineUnderline(marks()?.underline !== true)}
              label={t3({ en: "Underline", fr: "Souligné", pt: "Sublinhado" })}
            >
              <span class="underline">U</span>
            </ToolButton>
            {/* Text size — `[phrase]{size=N}`, points like a word processor,
                as Google Docs' − N + stepper. With no explicit mark the box
                shows the size the text actually RENDERS at (measured from the
                DOM by the editor, so a theme's heading scale is honoured), and
                the stepper steps from that. */}
            <div class="flex items-center">
              <ToolButton
                label={t3({
                  en: "Decrease text size",
                  fr: "Réduire la taille du texte",
                  pt: "Diminuir o tamanho do texto",
                })}
                onClick={() => stepSize(-1)}
              >
                <Icon iconName="minus" class="h-3.5 w-3.5" />
              </ToolButton>
              <Popover
                chevron={false}
                label={
                  <span class="bg-base-100 inline-block w-8 rounded border text-center text-xs leading-5">
                    {shownSize() ?? "–"}
                  </span>
                }
                title={t3({
                  en: "Text size",
                  fr: "Taille du texte",
                  pt: "Tamanho do texto",
                })}
              >
              {(close) => {
                const apply = (raw: string) => {
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 1 || n > 400) return;
                  p.api()?.setInlineSize(Math.round(n * 10) / 10);
                  close();
                };
                return (
                  <div class="ui-spy-sm flex w-28 flex-col">
                    <PopoverRow
                      active={marks()?.size === undefined}
                      onClick={() => {
                        p.api()?.setInlineSize(undefined);
                        close();
                      }}
                    >
                      {t3({ en: "Default", fr: "Par défaut", pt: "Predefinido" })}
                    </PopoverRow>
                    <For each={[8, 9, 10, 11, 12, 14, 18, 24, 36]}>
                      {(n) => (
                        <PopoverRow
                          active={marks()?.size === n}
                          onClick={() => {
                            p.api()?.setInlineSize(n);
                            close();
                          }}
                        >
                          {String(n)}
                        </PopoverRow>
                      )}
                    </For>
                    <input
                      type="number"
                      min="1"
                      max="400"
                      step="0.5"
                      class="mt-1 w-full rounded border px-2 py-1 text-sm"
                      placeholder={t3({ en: "Custom", fr: "Autre", pt: "Outro" })}
                      value={shownSize() ?? ""}
                      // Enter only — a blur-apply would fire (and close the
                      // panel) before a preset row's own click could land.
                      onKeyDown={(e) => {
                        if (e.key === "Enter") apply(e.currentTarget.value);
                      }}
                    />
                  </div>
                );
              }}
            </Popover>
              <ToolButton
                label={t3({
                  en: "Increase text size",
                  fr: "Augmenter la taille du texte",
                  pt: "Aumentar o tamanho do texto",
                })}
                onClick={() => stepSize(1)}
              >
                <Icon iconName="plus" class="h-3.5 w-3.5" />
              </ToolButton>
            </div>
            <Popover
              chevron={false}
              label={
                <span class={scopeClass}>
                  {/* border-current: the bar under the A takes the role's
                      own colour — or the literal — as Google Docs' colour
                      button does. */}
                  <span
                    class={`${
                      roleClassOf(marks()?.role)
                    } border-b-2 border-current px-0.5 font-600 leading-none`}
                    style={marks()?.color !== undefined ? { color: marks()?.color } : undefined}
                  >
                    A
                  </span>
                </span>
              }
              title={t3({ en: "Text colour", fr: "Couleur du texte", pt: "Cor do texto" })}
            >
              {(close) => (
                <InkPanel
                  scopeClass={scopeClass}
                  role={marks()?.role}
                  literal={marks()?.color}
                  onRole={(role) => p.api()?.setInlineRole(role)}
                  onLiteral={(color) => p.api()?.setInlineColor(color)}
                  onPick={close}
                />
              )}
            </Popover>
          </div>

          <Divider />

          <div class="flex items-center gap-0.5">
            <ToolButton
              active={() => marks()?.list === "bullet"}
              onClick={() => p.api()?.toggleLinePrefix("bullet")}
              label={t3({ en: "Bulleted list", fr: "Liste à puces", pt: "Lista com marcas" })}
            >
              <span>•</span>
            </ToolButton>
            <ToolButton
              active={() => marks()?.list === "ordered"}
              onClick={() => p.api()?.toggleLinePrefix("ordered")}
              label={t3({ en: "Numbered list", fr: "Liste numérotée", pt: "Lista numerada" })}
            >
              <span class="text-xs">1.</span>
            </ToolButton>
          </div>

          {/* The block under the cursor — its fence attributes append here. */}
          <Show when={target()}>
            {(block) => (
              <>
                <Divider />
                <div
                  class="flex flex-wrap items-center gap-0.5"
                  data-tour="report-block-controls"
                >
                  <code class="bg-base-100 text-base-content-muted shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs">
                    :::{block().name}
                  </code>

                  <Show when={targetName()}>
                    {(name) => (
                      <For each={choiceControlsFor(name())}>
                        {(control) => (
                          <Popover
                            label={`${control.label}: ${
                              control.options.find(
                                (o) =>
                                  o.value === (attrValue(control.attr) ?? control.fallback),
                              )?.label ?? control.fallback
                            }`}
                            title={control.label}
                          >
                            {(close) => (
                              <div class="ui-spy-sm flex flex-col">
                                <For each={control.options}>
                                  {(option) => (
                                    <PopoverRow
                                      active={(attrValue(control.attr) ??
                                        control.fallback) === option.value}
                                      onClick={() => {
                                        patch(
                                          control.attr,
                                          option.value === control.fallback
                                            ? undefined
                                            : option.value,
                                        );
                                        close();
                                      }}
                                    >
                                      {option.label}
                                    </PopoverRow>
                                  )}
                                </For>
                              </div>
                            )}
                          </Popover>
                        )}
                      </For>
                    )}
                  </Show>

                  {/* One background menu: tone presets over literal colours.
                      The trigger swatch shows whichever ground is active. */}
                  <Popover
                    label={
                      <span class="flex items-center gap-1.5">
                        <Show
                          when={attrValue("bg")}
                          fallback={
                            <span class={scopeClass}>
                              <span
                                class={`fm-tone fm-tone--${
                                  attrValue(toneAttrFor(block().name)) ?? "default"
                                } inline-block h-3.5 w-3.5 rounded-full`}
                              />
                            </span>
                          }
                        >
                          {(bg) => (
                            <span
                              class="inline-block h-3.5 w-3.5 rounded-full border"
                              style={{ "background-color": bg() }}
                            />
                          )}
                        </Show>
                        {t3({ en: "Background", fr: "Fond", pt: "Fundo" })}
                      </span>
                    }
                    title={t3({ en: "Background", fr: "Fond", pt: "Fundo" })}
                  >
                    {(close) => (
                      <GroundPanel
                        scopeClass={scopeClass}
                        tone={attrValue("bg") !== undefined
                          ? "literal"
                          : attrValue(toneAttrFor(block().name)) ?? "default"}
                        literal={attrValue("bg")}
                        onTone={(tone) =>
                          patchGround({
                            [toneAttrFor(block().name)]: tone === "default"
                              ? undefined
                              : tone,
                            bg: undefined,
                          })}
                        onLiteral={(color) =>
                          patchGround({
                            [toneAttrFor(block().name)]: undefined,
                            bg: color,
                          })}
                        onPick={close}
                      />
                    )}
                  </Popover>
                </div>
              </>
            )}
          </Show>
        </Show>
        </div>
      </div>
    </div>
  );
}

// The Google-Docs table size picker: a grid of cells, hover extends the
// highlighted block from the top-left, click inserts that many columns and
// (body) rows. Columns cap at 6 — tableSnippet clamps there, since a report
// column can't usefully hold more.
const TABLE_PICKER_COLS = 6;
const TABLE_PICKER_ROWS = 8;

// The count picker (stat tiles, cards, columns — or steps): one row of
// cells, hover extends the highlighted run from the left, click inserts that
// many. Grids read "N across"; a caller with another noun passes `caption`.
function TilesPicker(p: {
  onPick: (n: number) => void;
  max?: number;
  caption?: (n: number) => string;
}) {
  const [hover, setHover] = createSignal(1);
  const caption = (n: number) =>
    p.caption ? p.caption(n) : `${n} ${t3({ en: "across", fr: "en largeur", pt: "lado a lado" })}`;
  return (
    <div class="bg-base-100 ui-pad-sm shadow-floating rounded border">
      <div class="flex gap-0.5">
        <For each={Array.from({ length: p.max ?? TILES_MAX_COLS }, (_, i) => i + 1)}>
          {(n) => (
            <button
              type="button"
              class="h-6 w-6 rounded-[2px] border"
              classList={{
                "bg-primary-subtle border-primary": n <= hover(),
                "bg-base-200 border-base-300": n > hover(),
              }}
              onMouseEnter={() => setHover(n)}
              onClick={() => p.onPick(n)}
            />
          )}
        </For>
      </div>
      <div class="text-base-content-muted pt-1 text-center text-xs">
        {caption(hover())}
      </div>
    </div>
  );
}

// A menu row that opens a panel to its right on hover — the Insert menu's
// picker pattern (pure CSS, so the flyout stays up while the pointer travels
// over the row or the panel, both children of this wrapper).
function MenuFlyout(p: { label: string; children: JSX.Element }) {
  return (
    <div class="group relative">
      <PopoverRow active={false} onClick={() => {}}>
        <span class="flex-1">{p.label}</span>
        <span class="text-base-content-muted">▸</span>
      </PopoverRow>
      <div class="absolute top-0 left-full hidden pl-1 group-hover:block">
        {p.children}
      </div>
    </div>
  );
}

// Word count and the rest — what people open a File or Page menu looking for.
function DetailRows(p: {
  stats: {
    words: number;
    headings: number;
    figures: number;
    images: number;
    lastSaved: string;
  };
}) {
  const rows = () => [
    { label: t3({ en: "Words", fr: "Mots", pt: "Palavras" }), value: String(p.stats.words) },
    { label: t3({ en: "Headings", fr: "Titres", pt: "Títulos" }), value: String(p.stats.headings) },
    {
      label: t3({ en: "Visualizations", fr: "Visualisations", pt: "Visualizações" }),
      value: String(p.stats.figures),
    },
    { label: t3({ en: "Images", fr: "Images", pt: "Imagens" }), value: String(p.stats.images) },
    ...(p.stats.lastSaved
      ? [{
        label: t3({ en: "Last saved", fr: "Dernier enregistrement", pt: "Última gravação" }),
        value: p.stats.lastSaved,
      }]
      : []),
  ];
  return (
    <div class="flex flex-col gap-1 text-xs">
      <For each={rows()}>
        {(row) => (
          <div class="flex items-center gap-3">
            <span class="text-base-content-muted flex-1">{row.label}</span>
            <span class="font-mono">{row.value}</span>
          </div>
        )}
      </For>
    </div>
  );
}

// A theme at a glance: its page, ink and accent, in its own heading face.
// Drawn from the tokens rather than the stylesheet, so the flyout costs no
// scoped copy of every theme's CSS.
function ThemeChip(p: { theme: FastrReportTheme }) {
  const tok = () => FASTR_THEME_TOKENS[p.theme];
  return (
    <span
      class="border-base-300 flex h-10 w-full items-center gap-1 overflow-hidden rounded border px-1.5"
      style={{ background: tok().page, color: tok().ink }}
    >
      <span
        class="text-sm leading-none"
        style={{ "font-family": tok().fontHeading, "font-weight": tok().headingWeight }}
      >
        Aa
      </span>
      <span class="flex flex-1 flex-col gap-0.5">
        <span
          class="block h-1 w-full rounded-full"
          style={{ background: tok().accent }}
        />
        <span
          class="block h-1 w-3/4 rounded-full"
          style={{ background: tok().inkMuted }}
        />
      </span>
      <span
        class="h-5 w-2 rounded-sm"
        style={{ background: tok().toneDark }}
      />
    </span>
  );
}

// The cover picker: one tile per composition, each the real cover markup
// rendered under the toolbar's scoped theme sheet (buildFastrCoverTileCss
// shrinks and fills it), so a tile IS what the insert will look like in the
// current theme — a re-theme re-renders the tiles with everything else.
function CoverPicker(p: {
  scopeClass: string;
  onPick: (preset: FastrCoverPreset) => void;
}) {
  const tileText = () => ({
    kicker: t3({ en: "Ministry · 2026", fr: "Ministère · 2026", pt: "Ministério · 2026" }),
    title: t3({ en: "Report title", fr: "Titre du rapport", pt: "Título" }),
    sub: t3({ en: "What this report covers", fr: "Ce que couvre ce rapport", pt: "O que este relatório cobre" }),
  });
  return (
    <div class="bg-base-100 ui-pad-sm shadow-floating w-80 rounded border">
      <div class="grid grid-cols-2 gap-2">
        <For each={FASTR_COVER_PRESETS}>
          {(preset) => (
            <button
              type="button"
              class="ui-hoverable-base-200 flex flex-col gap-1 rounded p-1 text-left"
              onClick={() => p.onPick(preset)}
            >
              <div
                class={`fm-cover-tile border-base-300 w-full border ${p.scopeClass}`}
                innerHTML={renderFastrMarkdownToHtml(
                  coverSnippet(preset, tileText()),
                  { lineAnchors: false },
                )}
              />
              <div class="text-xs">{fastrCoverLayoutLabel(preset.layout)}</div>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

function TableGridPicker(p: { onPick: (cols: number, rows: number) => void }) {
  const [hover, setHover] = createSignal({ c: 1, r: 1 });
  const cells = Array.from(
    { length: TABLE_PICKER_COLS * TABLE_PICKER_ROWS },
    (_, i) => ({
      c: (i % TABLE_PICKER_COLS) + 1,
      r: Math.floor(i / TABLE_PICKER_COLS) + 1,
    }),
  );
  return (
    <div class="bg-base-100 ui-pad-sm shadow-floating rounded border">
      <div
        class="grid gap-0.5"
        style={{ "grid-template-columns": `repeat(${TABLE_PICKER_COLS}, 1rem)` }}
      >
        <For each={cells}>
          {(cell) => (
            <button
              type="button"
              class="h-4 w-4 rounded-[2px] border"
              classList={{
                "bg-primary-subtle border-primary":
                  cell.c <= hover().c && cell.r <= hover().r,
                "bg-base-200 border-base-300":
                  cell.c > hover().c || cell.r > hover().r,
              }}
              onMouseEnter={() => setHover({ c: cell.c, r: cell.r })}
              onClick={() => p.onPick(cell.c, cell.r)}
            />
          )}
        </For>
      </div>
      <div class="text-base-content-muted pt-1 text-center text-xs">
        {hover().c} × {hover().r}
      </div>
    </div>
  );
}


function roleClassOf(role: FastrInkRole | undefined): string {
  return role === undefined ? "" : `fm-mark fm-mark--${role}`;
}

// The combined ground panel: the theme's TONES as preset swatches on top —
// roles, so they re-theme with the document — above the literal colour grid
// (the same "standard" set panther's ColorPicker showed) and a hex field for
// anything else. Tone swatches paint the REAL scoped rule (fm-tone--accent is
// a color-mix JS cannot reproduce); the "default" tone doubles as the clear.
// `onPick` fires after any swatch click so a popover caller can close; live
// hex typing deliberately does not fire it.
function GroundPanel(p: {
  scopeClass: string;
  tone: string; // "default" | a tone name | "literal"
  literal: string | undefined;
  onTone: (tone: FastrTone) => void;
  onLiteral: (color: string) => void;
  onPick?: () => void;
}) {
  return (
    <div class="flex w-56 flex-col">
      <div class="text-base-content-muted pb-1 text-xs">
        {t3({ en: "Theme tones", fr: "Tons du thème", pt: "Tons do tema" })}
      </div>
      <div class="grid grid-cols-6 gap-1">
        <For each={FASTR_TONES}>
          {(tone) => (
            <button
              type="button"
              class="ui-focusable h-6 cursor-pointer overflow-hidden rounded"
              classList={{
                "ring-2 ring-primary": p.literal === undefined && p.tone === tone,
              }}
              title={fastrToneLabel(tone)}
              onClick={() => {
                p.onTone(tone);
                p.onPick?.();
              }}
            >
              <span class={`${p.scopeClass} block h-full w-full`}>
                <span
                  class={`fm-tone fm-tone--${tone} flex h-full w-full items-center justify-center text-[10px]`}
                >
                  Aa
                </span>
              </span>
            </button>
          )}
        </For>
      </div>
      <LiteralColours literal={p.literal} onLiteral={p.onLiteral} onPick={p.onPick} />
    </div>
  );
}

// The text colour panel — the same shape as the ground panel: the theme's
// INK ROLES as preset swatches on top (they re-theme with the document; the
// first swatch is "none", the ground's own ink), the literal grid and hex
// field below. Role swatches paint the REAL scoped rule.
function InkPanel(p: {
  scopeClass: string;
  role: FastrInkRole | undefined;
  literal: string | undefined;
  onRole: (role: FastrInkRole | undefined) => void;
  onLiteral: (color: string) => void;
  onPick?: () => void;
}) {
  const presets: (FastrInkRole | undefined)[] = [undefined, ...FASTR_INK_ROLES];
  return (
    <div class="flex w-56 flex-col">
      <div class="text-base-content-muted pb-1 text-xs">
        {t3({ en: "Theme colours", fr: "Couleurs du thème", pt: "Cores do tema" })}
      </div>
      <div class="grid grid-cols-7 gap-1">
        <For each={presets}>
          {(role) => (
            <button
              type="button"
              class="ui-focusable h-6 cursor-pointer overflow-hidden rounded border"
              classList={{
                "ring-2 ring-primary": p.literal === undefined && p.role === role,
              }}
              title={role === undefined
                ? t3({ en: "None", fr: "Aucune", pt: "Nenhuma" })
                : fastrRoleLabel(role)}
              onClick={() => {
                p.onRole(role);
                p.onPick?.();
              }}
            >
              <span class={`${p.scopeClass} flex h-full w-full items-center justify-center text-[11px]`}>
                <span class={`${roleClassOf(role)} font-600`}>Aa</span>
              </span>
            </button>
          )}
        </For>
      </div>
      <LiteralColours literal={p.literal} onLiteral={p.onLiteral} onPick={p.onPick} />
    </div>
  );
}

// The literal half of both panels. The caption says outright that these
// stop re-theming.
function LiteralColours(p: {
  literal: string | undefined;
  onLiteral: (color: string) => void;
  onPick?: () => void;
}) {
  const [hexInput, setHexInput] = createSignal<string | null>(null);
  const displayHex = () => hexInput() ?? p.literal ?? "";
  const hexIsValid = () => {
    const h = hexInput();
    return h === null || h === "" || isValidHex(h);
  };
  return (
    <>
      <div class="text-base-content-muted pt-2 pb-1 text-xs">
        {t3({ en: "Fixed colours", fr: "Couleurs fixes", pt: "Cores fixas" })}
      </div>
      <div class="grid grid-cols-6 gap-1">
        <For each={COLOR_SETS.standard}>
          {(color) => (
            <button
              type="button"
              class="ui-focusable h-6 cursor-pointer rounded border"
              classList={{
                "ring-2 ring-primary": p.literal !== undefined &&
                  p.literal.toLowerCase() === color.toLowerCase(),
              }}
              style={{ "background-color": color }}
              title={color}
              onClick={() => {
                p.onLiteral(color);
                p.onPick?.();
              }}
            />
          )}
        </For>
      </div>
      <input
        type="text"
        class="mt-2 w-full rounded border px-2 py-1 font-mono text-xs"
        classList={{ "border-danger": !hexIsValid() }}
        placeholder="#hex"
        value={displayHex()}
        onInput={(e) => {
          const v = e.currentTarget.value;
          setHexInput(v);
          if (isValidHex(v)) p.onLiteral(normalizeHex(v));
        }}
        onFocus={() => setHexInput(p.literal ?? "")}
        onBlur={() => setHexInput(null)}
      />
    </>
  );
}

function isValidHex(hex: string): boolean {
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

function normalizeHex(hex: string): string {
  let h = hex.trim();
  if (!h.startsWith("#")) h = "#" + h;
  if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h.toLowerCase();
}

function Divider() {
  return <div class="bg-base-300 mx-1 h-4 w-px" />;
}

function MenuDivider() {
  return <div class="bg-base-300 my-1 h-px w-full" />;
}

// A flat pill button, as in Google Docs: a hover tint only, a primary-subtle
// fill while its state is active. Letterforms stand in for the glyphs
// panther's IconName lacks (bold, italic, lists).
function ToolButton(p: {
  active?: () => boolean;
  onClick: () => void;
  label: string;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class="ui-focusable flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm"
      classList={{
        "bg-primary-subtle text-primary": p.active?.() === true,
        "ui-hoverable-base-300": p.active?.() !== true,
      }}
      aria-label={p.label}
      title={p.label}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  );
}

// Panther's showMenu takes string labels only — no swatch, no active tick — so
// any dropdown that has to SHOW a colour is hand-composed, the same way
// panther's own ColorPicker and the slide editor's TextStylePopover are.
// The panel rides the browser's TOP LAYER (the native popover API, same as
// panther's own menus): an inline-absolute panel is clipped by the header and
// out-stacked by the editor sheet's own stacking contexts, no z-index wins.
// `menu` renders the trigger as a plain menu-bar item (the Google Docs menu
// row) instead of a flat pill button with a dropdown chevron (`chevron`
// false drops the chevron, for the colour and size boxes).
function Popover(p: {
  label: JSX.Element;
  title: string;
  menu?: boolean;
  chevron?: boolean;
  tour?: string;
  children: (close: () => void) => JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
  let wrap!: HTMLDivElement;

  function onDocPointerDown(e: PointerEvent) {
    if (!wrap.contains(e.target as Node)) close();
  }
  function close() {
    setOpen(false);
    document.removeEventListener("pointerdown", onDocPointerDown, true);
  }
  function toggle(e: MouseEvent) {
    if (open()) return close();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Clamp so a right-edge popover never runs off screen.
    setAnchor({
      x: Math.max(8, Math.min(r.left, window.innerWidth - 260)),
      y: r.bottom + 4,
    });
    setOpen(true);
    document.addEventListener("pointerdown", onDocPointerDown, true);
  }
  onCleanup(() => document.removeEventListener("pointerdown", onDocPointerDown, true));

  return (
    <div ref={wrap}>
      <Show
        when={p.menu}
        fallback={
          <button
            type="button"
            class="ui-focusable ui-hoverable-base-300 flex h-7 items-center gap-1 rounded px-2 text-sm"
            aria-label={p.title}
            title={p.title}
            data-tour={p.tour}
            onClick={toggle}
          >
            {p.label}
            <Show when={p.chevron !== false}>
              <Icon iconName="chevronDown" class="text-base-content-muted h-3 w-3" />
            </Show>
          </button>
        }
      >
        <button
          type="button"
          class="ui-focusable ui-hoverable-base-100 rounded px-2 py-0.5 text-sm"
          data-tour={p.tour}
          onClick={toggle}
        >
          {p.label}
        </button>
      </Show>
      <Show when={open()}>
        <div
          ref={(el) => {
            // popover="manual": top layer without light-dismiss — the
            // pointerdown listener owns closing, so in-panel clicks (which
            // stay inside `wrap` in the DOM tree) keep it open.
            queueMicrotask(() => el.showPopover?.());
          }}
          popover="manual"
          class="bg-base-100 ui-pad-sm shadow-floating m-0 min-w-40 rounded border"
          style={{
            position: "fixed",
            left: `${anchor().x}px`,
            top: `${anchor().y}px`,
            // The UA popover stylesheet sets overflow:auto, which would CLIP
            // a submenu flyout (the table grid) into a scroll container
            // instead of letting it float beside the panel.
            overflow: "visible",
          }}
        >
          {p.children(close)}
        </div>
      </Show>
    </div>
  );
}

function PopoverRow(p: {
  active: boolean;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class="ui-focusable flex w-full items-center rounded px-2 py-1 text-left text-sm"
      classList={{
        "border-primary bg-primary-subtle font-700": p.active,
        "ui-hoverable-base-100": !p.active,
      }}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  );
}
