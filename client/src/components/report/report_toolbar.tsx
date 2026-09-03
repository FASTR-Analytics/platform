import {
  FASTR_BLOCK_SNIPPETS,
  FASTR_INK_ROLES,
  FASTR_TONES,
  type FastrBlockName,
  type FastrFencePatch,
  type FastrInkRole,
  type FastrOpenFence,
  type FastrReportTheme,
  type FastrThemeColorOverride,
  type FastrTone,
  buildFastrReportCss,
  isFastrBlockName,
  t3,
} from "lib";
import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { Button, ColorPicker } from "panther";
import {
  fastrBlockLabel,
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
// literal background picker, which says so. Panther has no bold/italic/heading
// glyph in its IconName union and cannot be modified here, so those buttons use
// letterforms — the same answer the slide editor's TextStylePopover reached.

type Props = {
  api: () => ReportEditorApi | undefined;
  context: () => ReportBlockContext | undefined;
  theme: () => FastrReportTheme;
  colors: () => FastrThemeColorOverride | undefined;
  // The `:::report` page-setup header — edited from the Page menu, since the
  // line itself is invisible in the editor (its widget is hidden and atomic).
  pageSetup: () => FastrOpenFence | undefined;
  onPatchPageSetup: (patch: FastrFencePatch) => void;
  // Embeds: inserts ride the Insert menu; a selected embed's controls replace
  // the toolbar row (slot, so the toolbar stays embed-agnostic).
  embedKind: () => "figure" | "image" | undefined;
  embedControls?: JSX.Element;
  canInsertEmbeds: () => boolean;
  onInsertFigure: () => void;
  onInsertImage: () => void;
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
    case "report":
    case "card":
    case "quote":
    case "band":
    case "cover":
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
    })
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

  const headingStyleFace = () => {
    const level = marks()?.headingLevel ?? 0;
    return level === 0
      ? t3({ en: "Normal text", fr: "Texte normal", pt: "Texto normal" })
      : `${t3({ en: "Heading", fr: "Titre", pt: "Título" })} ${level}`;
  };

  return (
    <div class="border-t" data-cursor-zone="header" data-tour="report-format-toolbar">
      <style>{swatchCss()}</style>

      {/* ── Menu row, Google Docs style ────────────────────────────────── */}
      <div class="flex flex-wrap items-center gap-1 px-2 pt-0.5">
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
                  <PopoverRow
                    active={false}
                    onClick={() => {
                      p.api()?.insertBlockOnNewLine(row.snippet);
                      close();
                    }}
                  >
                    {fastrBlockLabel(row.name)}
                  </PopoverRow>
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
                  sets the size, a click inserts. Pure CSS hover keeps the
                  flyout up while the pointer is on the row or the grid (the
                  flyout is a child of the row wrapper, flush at left-full). */}
              <div class="group relative">
                <PopoverRow active={false} onClick={() => {}}>
                  <span class="flex-1">
                    {t3({ en: "Table", fr: "Tableau", pt: "Tabela" })}
                  </span>
                  <span class="text-base-content-muted">▸</span>
                </PopoverRow>
                <div class="absolute top-0 left-full hidden pl-1 group-hover:block">
                  <TableGridPicker
                    onPick={(cols, rows) => {
                      p.api()?.insertTable(cols, rows);
                      close();
                    }}
                  />
                </div>
              </div>
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
              <div class="text-base-content-muted text-xs font-700">
                {t3({ en: "Width", fr: "Largeur", pt: "Largura" })}
              </div>
              <For
                each={[
                  { value: "normal", label: t3({ en: "Normal", fr: "Normale", pt: "Normal" }) },
                  { value: "wide", label: t3({ en: "Wide", fr: "Large", pt: "Larga" }) },
                  { value: "full", label: t3({ en: "Full", fr: "Pleine", pt: "Completa" }) },
                ]}
              >
                {(o) => (
                  <PopoverRow
                    active={(psAttr("width") ?? "normal") === o.value}
                    onClick={() => {
                      p.onPatchPageSetup({
                        width: o.value === "normal" ? undefined : o.value,
                      });
                    }}
                  >
                    {o.label}
                  </PopoverRow>
                )}
              </For>
              <div class="text-base-content-muted pt-2 text-xs font-700">
                {t3({ en: "Background", fr: "Fond", pt: "Fundo" })}
              </div>
              <PopoverRow
                active={psTone() === "default"}
                onClick={() => {
                  p.onPatchPageSetup({ background: undefined, bg: undefined });
                }}
              >
                {t3({ en: "Default", fr: "Par défaut", pt: "Predefinido" })}
              </PopoverRow>
              <For each={FASTR_TONES}>
                {(tone) => (
                  <PopoverRow
                    active={psTone() === tone}
                    onClick={() => {
                      p.onPatchPageSetup({ background: tone, bg: undefined });
                    }}
                  >
                    <span class={`${scopeClass} mr-2`}>
                      <ToneSwatch tone={tone} />
                    </span>
                    {fastrToneLabel(tone)}
                  </PopoverRow>
                )}
              </For>
              {/* A literal colour. Says outright that it stops re-theming. */}
              <div class="ui-gap-sm flex items-center pt-1">
                <ColorPicker
                  size="sm"
                  allowCustomHex
                  position="bottom-start"
                  value={psLiteral() ?? ""}
                  onChange={(color) =>
                    p.onPatchPageSetup({ bg: color, background: undefined })}
                />
                <Show when={psLiteral() !== undefined}>
                  <Button
                    size="sm"
                    outline
                    onBackground="base-100"
                    onClick={() =>
                      p.onPatchPageSetup({ bg: undefined, background: undefined })}
                  >
                    {t3({ en: "Clear colour", fr: "Effacer la couleur", pt: "Limpar cor" })}
                  </Button>
                </Show>
              </div>
              <div class="text-base-content-muted pt-2 text-xs font-700">
                {t3({ en: "Ink", fr: "Encre", pt: "Tinta" })}
              </div>
              <For each={[undefined, "light", "dark"] as const}>
                {(mode) => (
                  <PopoverRow
                    active={psAttr("ink") === mode ||
                      (mode === undefined && psAttr("ink") === undefined)}
                    onClick={() => {
                      p.onPatchPageSetup({ ink: mode });
                      close();
                    }}
                  >
                    {inkFace(mode)}
                  </PopoverRow>
                )}
              </For>
            </div>
          )}
        </Popover>
      </div>

      {/* ── The toolbar row: text controls, block segment, or the selected
             embed's controls (which replace the text controls, as selecting
             an image does in Google Docs) ─────────────────────────────────── */}
      <div class="ui-pad-sm ui-gap flex flex-wrap items-center pt-1">
        <Show
          when={p.embedKind() === undefined}
          fallback={
            <div class="ui-gap-sm flex flex-wrap items-center">
              {p.embedControls}
            </div>
          }
        >
          <div class="ui-gap-sm flex items-center">
            <Popover
              label={headingStyleFace()}
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

          <div class="ui-gap-sm flex items-center">
            <MarkButton
              active={() => marks()?.bold === true}
              onClick={() => p.api()?.toggleInlineMark("**", "**")}
              label={t3({ en: "Bold", fr: "Gras", pt: "Negrito" })}
            >
              <span class="font-700">B</span>
            </MarkButton>
            <MarkButton
              active={() => marks()?.italic === true}
              onClick={() => p.api()?.toggleInlineMark("*", "*")}
              label={t3({ en: "Italic", fr: "Italique", pt: "Itálico" })}
            >
              <span class="italic">I</span>
            </MarkButton>
            <MarkButton
              active={() => marks()?.code === true}
              onClick={() => p.api()?.toggleInlineMark("`", "`")}
              label={t3({ en: "Code", fr: "Code", pt: "Código" })}
            >
              <span class="font-mono">{"<>"}</span>
            </MarkButton>
            <Popover
              label={
                <span class={scopeClass}>
                  <span class={roleClassOf(marks()?.role)}>A</span>
                </span>
              }
              title={t3({ en: "Text colour", fr: "Couleur du texte", pt: "Cor do texto" })}
            >
              {(close) => (
                <div class="ui-spy-sm flex flex-col">
                  <PopoverRow
                    active={marks()?.role === undefined}
                    onClick={() => {
                      p.api()?.setInlineRole(undefined);
                      close();
                    }}
                  >
                    {t3({ en: "None", fr: "Aucune", pt: "Nenhuma" })}
                  </PopoverRow>
                  <For each={FASTR_INK_ROLES}>
                    {(role) => (
                      <PopoverRow
                        active={marks()?.role === role}
                        onClick={() => {
                          p.api()?.setInlineRole(role);
                          close();
                        }}
                      >
                        <span class={`${scopeClass} mr-2 inline-block`}>
                          <span class={`fm-mark fm-mark--${role}`}>Aa</span>
                        </span>
                        {fastrRoleLabel(role)}
                      </PopoverRow>
                    )}
                  </For>
                </div>
              )}
            </Popover>
          </div>

          <Divider />

          <div class="ui-gap-sm flex items-center">
            <MarkButton
              active={() => marks()?.list === "bullet"}
              onClick={() => p.api()?.toggleLinePrefix("bullet")}
              label={t3({ en: "Bulleted list", fr: "Liste à puces", pt: "Lista com marcas" })}
            >
              <span>•</span>
            </MarkButton>
            <MarkButton
              active={() => marks()?.list === "ordered"}
              onClick={() => p.api()?.toggleLinePrefix("ordered")}
              label={t3({ en: "Numbered list", fr: "Liste numérotée", pt: "Lista numerada" })}
            >
              <span class="text-xs">1.</span>
            </MarkButton>
          </div>

          {/* The block under the cursor — its fence attributes append here. */}
          <Show when={target()}>
            {(block) => (
              <>
                <Divider />
                <div
                  class="ui-gap-sm flex flex-wrap items-center"
                  data-tour="report-block-controls"
                >
                  <code class="bg-base-200 text-base-content-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
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

                  {/* Tone — a role, so it re-themes with everything else. */}
                  <Popover
                    label={
                      <span class="flex items-center gap-1.5">
                        <span class={scopeClass}>
                          <span
                            class={`fm-tone fm-tone--${
                              attrValue(toneAttrFor(block().name)) ?? "default"
                            } inline-block h-3.5 w-3.5 rounded-full`}
                          />
                        </span>
                        {t3({ en: "Tone", fr: "Ton", pt: "Tom" })}
                      </span>
                    }
                    title={t3({ en: "Tone", fr: "Ton", pt: "Tom" })}
                  >
                    {(close) => (
                      <div class="ui-spy-sm flex w-56 flex-col">
                        <For each={FASTR_TONES}>
                          {(tone) => (
                            <PopoverRow
                              active={(attrValue(toneAttrFor(block().name)) ?? "default") ===
                                tone}
                              onClick={() => {
                                patch(
                                  toneAttrFor(block().name),
                                  tone === "default" ? undefined : tone,
                                );
                                close();
                              }}
                            >
                              <span class={`${scopeClass} mr-2`}>
                                <ToneSwatch tone={tone} />
                              </span>
                              {fastrToneLabel(tone)}
                            </PopoverRow>
                          )}
                        </For>
                      </div>
                    )}
                  </Popover>

                  {/* A literal colour. Says outright that it stops re-theming. */}
                  <ColorPicker
                    size="sm"
                    allowCustomHex
                    position="bottom-start"
                    value={attrValue("bg") ?? ""}
                    onChange={(color) => patch("bg", color)}
                  />
                  <Show when={attrValue("bg") !== undefined}>
                    <Button
                      size="sm"
                      outline
                      onBackground="base-100"
                      onClick={() => patch("bg", undefined)}
                    >
                      {t3({ en: "Clear colour", fr: "Effacer la couleur", pt: "Limpar cor" })}
                    </Button>
                  </Show>

                  {/* Ink is a legibility override, not a colour. */}
                  <Popover
                    label={`${t3({ en: "Ink", fr: "Encre", pt: "Tinta" })}: ${
                      inkFace(attrValue("ink"))
                    }`}
                    title={t3({ en: "Ink", fr: "Encre", pt: "Tinta" })}
                  >
                    {(close) => (
                      <div class="ui-spy-sm flex flex-col">
                        <For each={[undefined, "light", "dark"] as const}>
                          {(mode) => (
                            <PopoverRow
                              active={attrValue("ink") === mode ||
                                (mode === undefined && attrValue("ink") === undefined)}
                              onClick={() => {
                                patch("ink", mode);
                                close();
                              }}
                            >
                              {inkFace(mode)}
                            </PopoverRow>
                          )}
                        </For>
                      </div>
                    )}
                  </Popover>
                </div>
              </>
            )}
          </Show>
        </Show>
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

function inkFace(mode: string | undefined): string {
  return mode === "light"
    ? t3({ en: "Light", fr: "Claire", pt: "Clara" })
    : mode === "dark"
    ? t3({ en: "Dark", fr: "Sombre", pt: "Escura" })
    : t3({ en: "Auto", fr: "Auto", pt: "Auto" });
}

function roleClassOf(role: FastrInkRole | undefined): string {
  return role === undefined ? "" : `fm-mark fm-mark--${role}`;
}

// A tone is a ground, so the swatch is the ground: the real rule, painted on
// the theme's own page colour.
function ToneSwatch(p: { tone: FastrTone }) {
  return (
    <span
      class={`fm-tone fm-tone--${p.tone} inline-flex h-5 w-8 items-center justify-center rounded text-[10px]`}
    >
      Aa
    </span>
  );
}

function Divider() {
  return <div class="bg-base-300 h-4 w-px" />;
}

function MenuDivider() {
  return <div class="bg-base-300 my-1 h-px w-full" />;
}

// A toolbar toggle: filled when active, outlined when not. The panther-native
// form of the slide editor's letterform flip, so it keeps ui-focusable and the
// disabled treatment for free.
function MarkButton(p: {
  active: () => boolean;
  onClick: () => void;
  label: string;
  children: JSX.Element;
}) {
  return (
    <Button
      size="sm"
      outline={!p.active()}
      onBackground={p.active() ? undefined : "base-100"}
      ariaLabel={p.label}
      onClick={p.onClick}
    >
      {p.children}
    </Button>
  );
}

// Panther's showMenu takes string labels only — no swatch, no active tick — so
// any dropdown that has to SHOW a colour is hand-composed, the same way
// panther's own ColorPicker and the slide editor's TextStylePopover are.
// The panel rides the browser's TOP LAYER (the native popover API, same as
// panther's own menus): an inline-absolute panel is clipped by the header and
// out-stacked by the editor sheet's own stacking contexts, no z-index wins.
// `menu` renders the trigger as a plain menu-bar item (the Google Docs menu
// row) instead of an outlined toolbar button.
function Popover(p: {
  label: JSX.Element;
  title: string;
  menu?: boolean;
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
          <Button
            size="sm"
            outline
            onBackground="base-100"
            ariaLabel={p.title}
            onClick={toggle}
          >
            {p.label}
          </Button>
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
