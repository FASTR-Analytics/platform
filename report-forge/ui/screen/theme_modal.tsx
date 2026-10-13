import { createSignal, For, onMount, Show } from "solid-js";
import {
  FASTR_REPORT_TEMPLATES,
  type FastrReportTemplate,
} from "../../engine/fastr_report_templates.ts";
import type { FastrReportTheme } from "../../engine/report_fastr_themes.ts";
import { t3 } from "../../engine/i18n.ts";
import { Button, FormError, Icon, Modal, type ModalProps } from "../kit/mod.ts";

import { fastrThemeCaption, fastrThemeLabel } from "./fastr_theme_labels.ts";
import {
  FastrCustomThemeMock,
  fastrMockScopeClass,
  FastrThemeMock,
  FastrThemeMockStyles,
} from "./fastr_theme_mock.tsx";
import { ReportTemplateGallery } from "./template_gallery.tsx";
import type { ReportPalette } from "./types.ts";

// The document's look, chosen from inside the document. The editor opens it
// unprompted the first time a new document is opened (settings.themeChosen
// === false) and from the Page menu after that.
//
// The body carries no CSS, so re-theming can never invalidate it.
//
// On a document that is still just its title (`offerTemplates`), the theme
// is step 1 of 2: Next applies it and moves to a template gallery
// (template_gallery.tsx), whose pick rides the result for the editor to
// write into the body. Skip there keeps the theme and the plain title.
//
// Tiles are the real stylesheets (FastrThemeMock), so a preview is exactly
// what the document becomes. A saved palette repaints the default theme.

export type ThemeChoice = { theme: FastrReportTheme; palette?: ReportPalette };

export type ThemeModalResult =
  // The look was applied (by `apply`, which the modal has already awaited).
  | {
    applied: true;
    // Step 2's pick, when templates were offered and one was chosen.
    template?: FastrReportTemplate;
  }
  // Open the host's palette editor. The caller runs it and re-opens this
  // modal after, so a host's own dialog never has to stack on this one.
  | { editPalette: ReportPalette | undefined };

type Sel =
  | { kind: "theme"; value: FastrReportTheme }
  | { kind: "custom"; style: ReportPalette };

type Props = ModalProps<
  {
    documentTitle: string;
    // The themes on offer, in order.
    themes: readonly FastrReportTheme[];
    // The document's current look, so the modal opens on what it already is.
    theme: FastrReportTheme;
    paletteId?: string;
    // The host's saved palettes, and whether it can edit one.
    listPalettes?: () => Promise<ReportPalette[]>;
    canEditPalettes: boolean;
    // A new document still holding only its title: the theme is step 1 of 2
    // and the template gallery follows.
    offerTemplates?: boolean;
    // Applies the choice (the host stores it). Rejects with the reason when
    // it could not, which the modal shows.
    apply: (choice: ThemeChoice) => Promise<void>;
  },
  ThemeModalResult
>;

export function ThemeModal(p: Props) {
  const [selected, setSelected] = createSignal<Sel | undefined>(
    p.paletteId === undefined ? { kind: "theme", value: p.theme } : undefined,
  );
  const [customStyles, setCustomStyles] = createSignal<ReportPalette[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string>();
  const [step, setStep] = createSignal<"theme" | "template">("theme");
  // Whether step 1 applied a look: step 2 closes with it whatever it picks.
  const [applied, setApplied] = createSignal(false);
  const [template, setTemplate] = createSignal<FastrReportTemplate>(
    FASTR_REPORT_TEMPLATES[0],
  );
  const templateScope = () => {
    const sel = selected();
    return sel?.kind === "custom"
      ? fastrMockScopeClass("default", sel.style.id)
      : fastrMockScopeClass(sel?.value ?? p.theme);
  };
  const finish = (t?: FastrReportTemplate) => {
    if (applied()) {
      p.close(
        t === undefined ? { applied: true } : { applied: true, template: t },
      );
    }
  };

  onMount(() => {
    void (async () => {
      const list = await p.listPalettes?.().catch(() => []) ?? [];
      setCustomStyles(list);
      // A palette is only selectable once its row has loaded.
      const current = list.find((s) => s.id === p.paletteId);
      if (current) setSelected({ kind: "custom", style: current });
    })();
  });

  function isSelected(sel: Sel): boolean {
    const cur = selected();
    if (!cur) return false;
    if (cur.kind === "theme" && sel.kind === "theme") {
      return cur.value === sel.value;
    }
    if (cur.kind === "custom" && sel.kind === "custom") {
      return cur.style.id === sel.style.id;
    }
    return false;
  }

  async function apply(sel: Sel | undefined) {
    if (!sel || saving()) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      // A palette rides the default stylesheet and repaints it with its own
      // colours, exactly as its tile shows it.
      await p.apply(
        sel.kind === "theme"
          ? { theme: sel.value }
          : { theme: "default", palette: sel.style },
      );
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaving(false);
      return;
    }
    setSaving(false);
    if (p.offerTemplates) {
      setApplied(true);
      setStep("template");
      return;
    }
    p.close({ applied: true });
  }

  return (
    <Modal
      width="2xl"
      title={step() === "template"
        ? t3({
          en: `Start “${p.documentTitle}” from a template`,
          fr: `Commencer « ${p.documentTitle} » à partir d'un modèle`,
          pt: `Começar “${p.documentTitle}” a partir de um modelo`,
        })
        : t3({
          en: `Choose a theme for “${p.documentTitle}”`,
          fr: `Choisissez un thème pour « ${p.documentTitle} »`,
          pt: `Escolha um tema para “${p.documentTitle}”`,
        })}
      subtitle={p.offerTemplates
        ? step() === "theme"
          ? t3({
            en: "Step 1 of 2: theme",
            fr: "Étape 1 sur 2 : thème",
            pt: "Passo 1 de 2: tema",
          })
          : t3({
            en: "Step 2 of 2: template",
            fr: "Étape 2 sur 2 : modèle",
            pt: "Passo 2 de 2: modelo",
          })
        : undefined}
      // Step 2's cancel is Skip: the theme is already applied, so it closes
      // with that and no template.
      onCancel={() => step() === "template" ? finish() : p.close(undefined)}
      cancelLabel={step() === "template"
        ? t3({ en: "Skip", fr: "Passer", pt: "Saltar" })
        : undefined}
      footer={step() === "template"
        ? (
          <Button
            intent="neutral"
            outline
            iconName="chevronLeft"
            onClick={() => setStep("theme")}
          >
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        )
        : undefined}
      actions={step() === "template"
        ? [{
          label: t3({
            en: "Use template",
            fr: "Utiliser le modèle",
            pt: "Usar modelo",
          }),
          onClick: () => finish(template()),
          iconName: "check" as const,
          intent: "success" as const,
        }]
        : [{
          label: p.offerTemplates
            ? t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })
            : t3({
              en: "Apply theme",
              fr: "Appliquer le thème",
              pt: "Aplicar tema",
            }),
          onClick: () => void apply(selected()),
          loading: saving(),
          disabled: selected() === undefined,
          iconName: p.offerTemplates
            ? "chevronRight" as const
            : "check" as const,
          intent: "success" as const,
        }]}
    >
      <FastrThemeMockStyles customStyles={customStyles()} />
      <Show when={step() === "template"}>
        <ReportTemplateGallery
          reportLabel={p.documentTitle}
          scopeClass={templateScope()}
          selected={template()}
          onSelect={setTemplate}
          onPick={(t) => finish(t)}
        />
      </Show>
      <div class="rf:ui-spy-sm" classList={{ "rf:hidden": step() !== "theme" }}>
        <div class="rf:text-base-content-muted rf:text-sm">
          {t3({
            en:
              "The theme is the report's real stylesheet, so these previews are exactly what you get. You can change it again at any time from the Page menu.",
            fr:
              "Le thème est la feuille de style réelle du rapport : ces aperçus sont exactement ce que vous obtiendrez. Vous pouvez en changer à tout moment depuis le menu Page.",
            pt:
              "O tema é a folha de estilos real do relatório, por isso estas pré-visualizações são exatamente o que vai obter. Pode alterá-lo a qualquer momento no menu Página.",
          })}
        </div>
        <div class="rf:grid rf:grid-cols-2 rf:gap-3 rf:md:grid-cols-3 rf:xl:grid-cols-4">
          <For each={p.themes}>
            {(theme) => {
              const sel: Sel = { kind: "theme", value: theme };
              return (
                <button
                  type="button"
                  class="rf:ui-focusable rf:group rf:p-1.5 rf:text-left"
                  classList={{
                    "rf:ring-primary rf:ring-2": isSelected(sel),
                    "rf:hover:bg-base-200": !isSelected(sel),
                  }}
                  onClick={() => setSelected(sel)}
                  onDblClick={() => void apply(sel)}
                >
                  <FastrThemeMock theme={theme} />
                  <div class="rf:text-base-content rf:font-700 rf:mt-1.5">
                    {fastrThemeLabel(theme)}
                  </div>
                  <div class="rf:text-base-content-muted rf:text-xs rf:leading-snug">
                    {fastrThemeCaption(theme)}
                  </div>
                </button>
              );
            }}
          </For>
          <For each={customStyles()}>
            {(style) => {
              const sel: Sel = { kind: "custom", style };
              return (
                <button
                  type="button"
                  class="rf:ui-focusable rf:group rf:relative rf:p-1.5 rf:text-left"
                  classList={{
                    "rf:ring-primary rf:ring-2": isSelected(sel),
                    "rf:hover:bg-base-200": !isSelected(sel),
                  }}
                  onClick={() => setSelected(sel)}
                  onDblClick={() => void apply(sel)}
                >
                  <FastrCustomThemeMock style={style} />
                  <div class="rf:text-base-content rf:font-700 rf:mt-1.5 rf:flex rf:items-center rf:gap-1.5">
                    <span class="rf:min-w-0 rf:truncate">{style.label}</span>
                    <span class="rf:bg-base-300 rf:text-base-content rf:rounded rf:px-1 rf:text-xs">
                      {t3({ en: "custom", fr: "perso", pt: "próprio" })}
                    </span>
                  </div>
                  <div class="rf:text-base-content-muted rf:text-xs rf:leading-snug">
                    {style.description}
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    class="rf:bg-base-100 rf:hover:bg-base-200 rf:absolute rf:top-3 rf:right-3 rf:rounded rf:border rf:p-1"
                    title={t3({
                      en: "Edit style",
                      fr: "Modifier le style",
                      pt: "Editar estilo",
                    })}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.close({ editPalette: style });
                    }}
                  >
                    <Icon name="pencil" class="rf:h-3.5 rf:w-3.5" />
                  </span>
                </button>
              );
            }}
          </For>
        </div>
        <FormError error={saveError()} />
      </div>
    </Modal>
  );
}
