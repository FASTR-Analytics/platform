import {
  FASTR_REPORT_THEMES,
  type FastrReportTemplate,
  type FastrReportTheme,
  type ReportConfig,
  type ReportCustomStyle,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  Button,
  Icon,
  ModalContainer,
  StateHolderFormError,
  type StateHolderFormAction,
} from "panther";
import { createSignal, For, onMount, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  fastrThemeCaption,
  fastrThemeLabel,
} from "./fastr_theme_labels";
import {
  FastrCustomThemeMock,
  fastrMockScopeClass,
  FastrThemeMock,
  FastrThemeMockStyles,
} from "./fastr_theme_mock";
import { ReportTemplateGallery } from "./template_gallery";

// The report's look, chosen from inside the report. Every new report is FASTR
// Markdown on the default theme, so this is the one place a report's design
// is decided: the editor opens it unprompted the first time a new report is
// opened (config.themeChosen === false) and from the Page menu after that.
//
// A fastr body carries no CSS, so re-theming can never invalidate it. That is
// what separates this from an html report's style, which is fixed at creation
// because the body IS the design.
//
// On a report that is still just its title (`offerTemplates`), the theme is
// step 1 of 2: Next applies it and moves to a template gallery
// (template_gallery.tsx), whose pick rides the result for the editor to
// write into the body. Skip there keeps the theme and the plain title.
//
// Tiles are the real stylesheets (FastrThemeMock), so a preview is exactly
// what the report becomes. A saved custom style contributes only its palette
// here; its design brief and reference stylesheet are for the AI in html
// reports.

export type ReportThemeModalResult =
  // The STORED config the write produced: the style snapshot is resolved
  // server-side, so the editor repaints from this rather than re-reading the
  // report, which would race the products SSE.
  | {
    applied: { lastUpdated: string; config: ReportConfig };
    // Step 2's pick, when templates were offered and one was chosen.
    template?: FastrReportTemplate;
  }
  // Open the style editor. The caller runs it and re-opens this modal after:
  // panther has ONE alert slot, so the editor cannot stack on this one.
  | { editStyle: { style?: ReportCustomStyle } };

type Sel =
  | { kind: "theme"; value: FastrReportTheme }
  | { kind: "custom"; style: ReportCustomStyle };

type Props = AlertComponentProps<
  {
    productId: string;
    reportLabel: string;
    // The report's current look, so the modal opens on what it already is.
    fastrTheme: FastrReportTheme;
    customStyleId?: string;
    // A new report still holding only its title: the theme is step 1 of 2
    // and the template gallery follows.
    offerTemplates?: boolean;
  },
  ReportThemeModalResult
>;

export function ReportThemeModal(p: Props) {
  const [selected, setSelected] = createSignal<Sel | undefined>(
    p.customStyleId === undefined
      ? { kind: "theme", value: p.fastrTheme }
      : undefined,
  );
  const [customStyles, setCustomStyles] = createSignal<ReportCustomStyle[]>([]);
  const [saveState, setSaveState] = createSignal<StateHolderFormAction>({
    status: "ready",
  });
  const [step, setStep] = createSignal<"theme" | "template">("theme");
  // The theme write step 1 made: step 2 closes with it whatever it picks.
  const [applied, setApplied] = createSignal<
    { lastUpdated: string; config: ReportConfig } | undefined
  >();
  const [template, setTemplate] = createSignal<FastrReportTemplate>("policy_brief");
  const templateScope = () => {
    const sel = selected();
    return sel?.kind === "custom"
      ? fastrMockScopeClass("default", sel.style.id)
      : fastrMockScopeClass(sel?.value ?? p.fastrTheme);
  };
  const finish = (t?: FastrReportTemplate) => {
    const a = applied();
    if (a) p.close(t === undefined ? { applied: a } : { applied: a, template: t });
  };

  onMount(() => {
    void (async () => {
      const res = await serverActions.listReportStyles({
        product_id: p.productId,
      });
      if (!res.success) return;
      setCustomStyles(res.data);
      // A custom style is only selectable once its row has loaded.
      const current = res.data.find((s) => s.id === p.customStyleId);
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
    if (!sel || saveState().status === "loading") return;
    setSaveState({ status: "loading" });
    // A custom style rides the default stylesheet and repaints it with its
    // own palette, exactly as its tile shows it.
    const res = await serverActions.setReportStyle({
      product_id: p.productId,
      fastrTheme: sel.kind === "theme" ? sel.value : "default",
      customStyleId: sel.kind === "custom" ? sel.style.id : null,
    });
    if (!res.success) {
      setSaveState({ status: "error", err: res.err });
      return;
    }
    if (p.offerTemplates) {
      setApplied(res.data);
      setSaveState({ status: "ready" });
      setStep("template");
      return;
    }
    p.close({ applied: res.data });
  }

  return (
    <ModalContainer
      width="2xl"
      title={step() === "template"
        ? t3({
          en: `Start “${p.reportLabel}” from a template`,
          fr: `Commencer « ${p.reportLabel} » à partir d'un modèle`,
          pt: `Começar “${p.reportLabel}” a partir de um modelo`,
        })
        : t3({
          en: `Choose a theme for “${p.reportLabel}”`,
          fr: `Choisissez un thème pour « ${p.reportLabel} »`,
          pt: `Escolha um tema para “${p.reportLabel}”`,
        })}
      subtitle={p.offerTemplates
        ? step() === "theme"
          ? t3({ en: "Step 1 of 2: theme", fr: "Étape 1 sur 2 : thème", pt: "Passo 1 de 2: tema" })
          : t3({ en: "Step 2 of 2: template", fr: "Étape 2 sur 2 : modèle", pt: "Passo 2 de 2: modelo" })
        : undefined}
      // Step 2's cancel is Skip: the theme is already applied, so it closes
      // with that and no template.
      onCancel={() => step() === "template" ? finish() : p.close(undefined)}
      cancelLabel={step() === "template"
        ? t3({ en: "Skip", fr: "Passer", pt: "Saltar" })
        : undefined}
      footer={step() === "template"
        ? (
          <Button intent="neutral" outline iconName="chevronLeft" onClick={() => setStep("theme")}>
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        )
        : undefined}
      actions={step() === "template"
        ? [{
          label: t3({ en: "Use template", fr: "Utiliser le modèle", pt: "Usar modelo" }),
          onClick: () => finish(template()),
          iconName: "check" as const,
          intent: "success" as const,
        }]
        : [{
          label: p.offerTemplates
            ? t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })
            : t3({ en: "Apply theme", fr: "Appliquer le thème", pt: "Aplicar tema" }),
          onClick: () => void apply(selected()),
          state: saveState(),
          disabled: selected() === undefined,
          iconName: p.offerTemplates ? "chevronRight" as const : "check" as const,
          intent: "success" as const,
        }]}
    >
      <FastrThemeMockStyles customStyles={customStyles()} />
      <Show when={step() === "template"}>
        <ReportTemplateGallery
          reportLabel={p.reportLabel}
          scopeClass={templateScope()}
          selected={template()}
          onSelect={setTemplate}
          onPick={(t) => finish(t)}
        />
      </Show>
      <div class="ui-spy-sm" classList={{ hidden: step() !== "theme" }}>
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "The theme is the report's real stylesheet, so these previews are exactly what you get. You can change it again at any time from the Page menu.",
            fr: "Le thème est la feuille de style réelle du rapport : ces aperçus sont exactement ce que vous obtiendrez. Vous pouvez en changer à tout moment depuis le menu Page.",
            pt: "O tema é a folha de estilos real do relatório, por isso estas pré-visualizações são exatamente o que vai obter. Pode alterá-lo a qualquer momento no menu Página.",
          })}
        </div>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <For each={FASTR_REPORT_THEMES}>
            {(theme) => {
              const sel: Sel = { kind: "theme", value: theme };
              return (
                <button
                  type="button"
                  class="ui-focusable group rounded-md p-1.5 text-left"
                  classList={{
                    "ring-primary ring-2": isSelected(sel),
                    "hover:bg-base-200": !isSelected(sel),
                  }}
                  onClick={() => setSelected(sel)}
                  onDblClick={() => void apply(sel)}
                >
                  <FastrThemeMock theme={theme} />
                  <div class="text-base-content mt-1.5 text-sm font-semibold">
                    {fastrThemeLabel(theme)}
                  </div>
                  <div class="text-base-content-muted text-xs leading-snug">
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
                  class="ui-focusable group relative rounded-md p-1.5 text-left"
                  classList={{
                    "ring-primary ring-2": isSelected(sel),
                    "hover:bg-base-200": !isSelected(sel),
                  }}
                  onClick={() => setSelected(sel)}
                  onDblClick={() => void apply(sel)}
                >
                  <FastrCustomThemeMock style={style} />
                  <div class="text-base-content mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
                    <span class="min-w-0 truncate">{style.label}</span>
                    <span class="bg-base-300 text-base-content rounded px-1 text-xs font-normal">
                      {t3({ en: "custom", fr: "perso", pt: "próprio" })}
                    </span>
                  </div>
                  <div class="text-base-content-muted text-xs leading-snug">
                    {style.description}
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    class="bg-base-100 hover:bg-base-200 absolute top-3 right-3 rounded border p-1"
                    title={t3({ en: "Edit style", fr: "Modifier le style", pt: "Editar estilo" })}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.close({ editStyle: { style } });
                    }}
                  >
                    <Icon iconName="pencil" class="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            }}
          </For>
        </div>
        <Show when={customStyles().length > 0}>
          <div class="text-base-content-muted text-xs">
            {t3({
              en: "A saved style contributes only its colours here: its design brief guides the AI in HTML reports, and its stylesheet targets markup FASTR Markdown does not produce.",
              fr: "Un style enregistré n'apporte ici que ses couleurs : son guide de style oriente l'IA dans les rapports HTML, et sa feuille de style vise un balisage que FASTR Markdown ne produit pas.",
              pt: "Um estilo guardado contribui aqui apenas com as suas cores: o seu guia de estilo orienta a IA nos relatórios HTML, e a sua folha de estilos visa marcação que o FASTR Markdown não produz.",
            })}
          </div>
        </Show>
        <StateHolderFormError state={saveState()} />
      </div>
    </ModalContainer>
  );
}
