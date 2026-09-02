import {
  FASTR_BLOCK_SNIPPETS,
  FASTR_INK_ROLES,
  FASTR_TONES,
  type FastrBlockName,
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
  For,
  type JSX,
  Show,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
} from "solid-js";
import { Button, ColorPicker, showMenu } from "panther";
import {
  fastrBlockLabel,
  fastrRoleLabel,
  fastrToneLabel,
} from "~/components/_shared/fastr_block_labels";
import type { ReportBlockContext, ReportEditorApi } from "./report_editor";

// The FASTR Markdown formatting strip, under the report header.
//
// Two halves with two different jobs. The left half is always there and acts on
// TEXT (the ordinary markdown a report is mostly made of, which this editor has
// never had buttons for). The right half appears only when the caret is inside
// a `:::` block and edits THAT block's opening fence — which is what turns the
// format from "syntax you have to remember" into something you can drive.
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
    case "report":
      return [{
        attr: "width",
        label: t3({ en: "Width", fr: "Largeur", pt: "Largura" }),
        fallback: "normal",
        options: [
          { value: "normal", label: t3({ en: "Normal", fr: "Normale", pt: "Normal" }) },
          { value: "wide", label: t3({ en: "Wide", fr: "Large", pt: "Larga" }) },
          { value: "full", label: t3({ en: "Full", fr: "Pleine", pt: "Completa" }) },
        ],
      }];
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
  // The block the contextual half acts on: the fence on the caret's own line
  // when there is one (that is the only way a leaf block like `:::stat` is ever
  // reachable), otherwise the innermost block enclosing it.
  const target = createMemo<FastrOpenFence | undefined>(() => {
    const ctx = p.context();
    if (!ctx) return undefined;
    return ctx.fenceHere ?? ctx.stack[ctx.stack.length - 1];
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

  function insertMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    showMenu({
      anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
      position: "bottom-start",
      items: FASTR_BLOCK_SNIPPETS.map((row) => ({
        label: fastrBlockLabel(row.name),
        onClick: () => p.api()?.insertBlockOnNewLine(row.snippet),
      })),
    });
  }

  return (
    <div
      class="ui-pad-sm ui-gap flex flex-wrap items-center border-t"
      data-cursor-zone="header"
      data-tour="report-format-toolbar"
    >
      <style>{swatchCss()}</style>

      {/* ── Insert ─────────────────────────────────────────────────────── */}
      <div class="ui-gap-sm flex items-center">
        <Button size="sm" iconName="plus" onClick={insertMenu}>
          {t3({ en: "Insert", fr: "Insérer", pt: "Inserir" })}
        </Button>
      </div>

      <Divider />

      {/* ── Text ───────────────────────────────────────────────────────── */}
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
      </div>

      <Divider />

      <div class="ui-gap-sm flex items-center">
        <Popover
          label={headingFace(marks()?.headingLevel ?? 0)}
          title={t3({ en: "Heading", fr: "Titre", pt: "Título" })}
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
                      ? t3({ en: "Paragraph", fr: "Paragraphe", pt: "Parágrafo" })
                      : `${t3({ en: "Heading", fr: "Titre", pt: "Título" })} ${level}`}
                  </PopoverRow>
                )}
              </For>
            </div>
          )}
        </Popover>
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

      <Divider />

      {/* ── Text colour ────────────────────────────────────────────────── */}
      <div class="ui-gap-sm flex items-center">
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
        <Button
          size="sm"
          outline
          onBackground="base-100"
          onClick={() => p.api()?.insertLink()}
        >
          {t3({ en: "Link", fr: "Lien", pt: "Ligação" })}
        </Button>
        <Button
          size="sm"
          outline
          onBackground="base-100"
          onClick={() => p.api()?.insertTable(3, 3)}
        >
          {t3({ en: "Table", fr: "Tableau", pt: "Tabela" })}
        </Button>
      </div>

      {/* ── The block under the cursor ─────────────────────────────────── */}
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
                            (o) => o.value === (attrValue(control.attr) ?? control.fallback),
                          )?.label ?? control.fallback
                        }`}
                        title={control.label}
                      >
                        {(close) => (
                          <div class="ui-spy-sm flex flex-col">
                            <For each={control.options}>
                              {(option) => (
                                <PopoverRow
                                  active={(attrValue(control.attr) ?? control.fallback) ===
                                    option.value}
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
                          active={(attrValue(toneAttrFor(block().name)) ?? "default") === tone}
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

              {/* Ink is a legibility override, not a colour — light or dark. */}
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

function headingFace(level: number): string {
  return level === 0 ? "¶" : `H${level}`;
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
function Popover(p: {
  label: JSX.Element;
  title: string;
  children: (close: () => void) => JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  let wrap!: HTMLDivElement;

  function onDocPointerDown(e: PointerEvent) {
    if (!wrap.contains(e.target as Node)) close();
  }
  function close() {
    setOpen(false);
    document.removeEventListener("pointerdown", onDocPointerDown, true);
  }
  function toggle() {
    if (open()) return close();
    setOpen(true);
    document.addEventListener("pointerdown", onDocPointerDown, true);
  }
  onCleanup(() => document.removeEventListener("pointerdown", onDocPointerDown, true));

  return (
    <div class="relative" ref={wrap}>
      <Button
        size="sm"
        outline
        onBackground="base-100"
        ariaLabel={p.title}
        onClick={toggle}
      >
        {p.label}
      </Button>
      <Show when={open()}>
        <div class="bg-base-100 ui-pad-sm shadow-floating absolute top-full left-0 z-50 mt-1 min-w-40 rounded border">
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
