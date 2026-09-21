import {
  REPORT_CUSTOM_BRIEF_MAX,
  REPORT_HTML_STYLES,
  REPORT_STYLE_BRIEFS,
  REPORT_STYLE_REFERENCE_CSS_MAX,
  type ReportCustomStyle,
  type ReportHtmlStyle,
  type ReportStyleColors,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  Button,
  Checkbox,
  Input,
  ModalContainer,
  RadioGroup,
  Select,
  StateHolderFormError,
  type StateHolderFormAction,
  TextArea,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

// Create / edit one custom report style (a library row in the MAIN db; the
// brief is injected into the AI's instructions exactly like a preset's).
// Opened from the style picker's "+ New style" tile / edit affordance (as a
// wizard step, one panther modal slot), and from the report editor's
// "Save this report's style..." flow with `seed` carrying the AI-distilled
// draft. Delete lives here (not on picker tiles) because openConfirm would
// replace the picker modal.
//
// Visibility is per PRODUCT (PLAN_PRODUCTS_RESTRUCTURE): this report, a
// chosen set of reports, or every report on the instance.

export type ReportStyleEditorResult = { saved: true };

type Visibility = "report" | "selected" | "instance";

type Props = AlertComponentProps<
  {
    productId: string;
    existing?: ReportCustomStyle;
    seed?: {
      label: string;
      description: string;
      brief: string;
      referenceCss: string | null;
      colors: ReportStyleColors | null;
    };
  },
  ReportStyleEditorResult
>;

const DEFAULT_COLORS: ReportStyleColors = {
  page: "#FFFFFF",
  ink: "#222222",
  accent: "#2A6FA8",
};

export function ReportStyleEditor(p: Props) {
  const base = p.existing ?? (p.seed
    ? { ...p.seed, productIds: [p.productId] as string[] | null }
    : undefined);
  const [label, setLabel] = createSignal(base?.label ?? "");
  const [description, setDescription] = createSignal(base?.description ?? "");
  const [brief, setBrief] = createSignal(base?.brief ?? "");
  const [referenceCss, setReferenceCss] = createSignal(base?.referenceCss ?? "");
  const [colors, setColors] = createSignal<ReportStyleColors>(
    base?.colors ?? DEFAULT_COLORS,
  );
  const initialVisibility: Visibility = base
    ? base.productIds === null
      ? "instance"
      : base.productIds.length === 1 && base.productIds[0] === p.productId
      ? "report"
      : "selected"
    : "report";
  const [visibility, setVisibility] = createSignal<Visibility>(initialVisibility);
  const [selectedReports, setSelectedReports] = createSignal<Set<string>>(
    new Set(
      p.existing?.productIds ?? [p.productId],
    ),
  );
  const reportProducts = () =>
    instanceState.products.filter((product) => product.type === "report");
  const [prefill, setPrefill] = createSignal<string>("_none");
  const [saveState, setSaveState] = createSignal<StateHolderFormAction>({
    status: "ready",
  });
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);

  function toggleReport(id: string) {
    const next = new Set(selectedReports());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedReports(next);
  }

  // An empty selection would hide the style from the report being edited in,
  // including the one it was just saved from: fall back to that report.
  function productIdsForSave(): string[] | null {
    if (visibility() === "instance") return null;
    if (visibility() === "report") return [p.productId];
    const ids = [...selectedReports()];
    return ids.length > 0 ? ids : [p.productId];
  }

  function applyPrefill(preset: string) {
    setPrefill(preset);
    if (preset === "_none") return;
    const entry = REPORT_STYLE_BRIEFS[preset as Exclude<ReportHtmlStyle, "default">];
    if (entry) setBrief(entry.brief);
  }

  async function save() {
    if (saveState().status === "loading") return;
    if (!label().trim()) {
      setSaveState({
        status: "error",
        err: t3({ en: "You must enter a name", fr: "Vous devez saisir un nom", pt: "Tem de introduzir um nome" }),
      });
      return;
    }
    if (!brief().trim()) {
      setSaveState({
        status: "error",
        err: t3({
          en: "The design brief is empty — describe the style, or start from a preset.",
          fr: "La description du style est vide — décrivez le style ou partez d'un préréglage.",
          pt: "O guia de estilo está vazio — descreva o estilo ou parta de uma predefinição.",
        }),
      });
      return;
    }
    setSaveState({ status: "loading" });
    const body = {
      label: label().trim(),
      description: description().trim(),
      brief: brief(),
      referenceCss: referenceCss().trim()
        ? referenceCss().slice(0, REPORT_STYLE_REFERENCE_CSS_MAX)
        : null,
      colors: colors(),
      productIds: productIdsForSave(),
    };
    const res = p.existing
      ? await serverActions.updateReportStyle({
        product_id: p.productId,
        style_id: p.existing.id,
        ...body,
      })
      : await serverActions.createReportStyle({
        product_id: p.productId,
        ...body,
      });
    if (!res.success) {
      setSaveState({ status: "error", err: res.err });
      return;
    }
    p.close({ saved: true });
  }

  async function doDelete() {
    if (!p.existing || saveState().status === "loading") return;
    setSaveState({ status: "loading" });
    const res = await serverActions.deleteReportStyle({
      product_id: p.productId,
      style_id: p.existing.id,
    });
    if (!res.success) {
      setSaveState({ status: "error", err: res.err });
      return;
    }
    p.close({ saved: true });
  }

  const colorField = (
    key: keyof ReportStyleColors,
    labelText: string,
  ) => (
    <label class="flex items-center gap-2">
      <input
        type="color"
        value={colors()[key]}
        onInput={(e) => setColors({ ...colors(), [key]: e.currentTarget.value })}
        class="h-7 w-9 cursor-pointer rounded border p-0"
      />
      <span class="ui-form-text">{labelText}</span>
    </label>
  );

  return (
    <ModalContainer
      width="lg"
      title={p.existing
        ? t3({ en: "Edit custom style", fr: "Modifier le style personnalisé", pt: "Editar estilo personalizado" })
        : t3({ en: "New custom style", fr: "Nouveau style personnalisé", pt: "Novo estilo personalizado" })}
      onCancel={() => p.close(undefined)}
      footer={p.existing
        ? (
          <Button
            outline
            intent="danger"
            iconName="trash"
            onClick={() => {
              if (confirmingDelete()) void doDelete();
              else setConfirmingDelete(true);
            }}
          >
            {confirmingDelete()
              ? t3({ en: "Confirm delete", fr: "Confirmer la suppression", pt: "Confirmar eliminação" })
              : t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" })}
          </Button>
        )
        : undefined}
      actions={[{
        label: t3({ en: "Save style", fr: "Enregistrer le style", pt: "Guardar estilo" }),
        onClick: () => void save(),
        state: saveState(),
        iconName: "save" as const,
        intent: "success" as const,
      }]}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "Name", fr: "Nom", pt: "Nome" })}
          value={label()}
          onChange={setLabel}
          fullWidth
          autoFocus={!p.seed}
        />
        <Input
          label={t3({ en: "Short description", fr: "Description courte", pt: "Descrição curta" })}
          value={description()}
          onChange={setDescription}
          fullWidth
        />
        <div class="ui-spy-sm">
          <TextArea
            label={t3({
              en: "Design brief — what the AI follows when it writes reports in this style",
              fr: "Guide de style — ce que l'IA suit quand elle rédige dans ce style",
              pt: "Guia de estilo — o que a IA segue ao escrever neste estilo",
            })}
            value={brief()}
            onChange={setBrief}
            rows={12}
            mono
            fullWidth
            placeholder={t3({
              en: "Fonts (via @import), palette, structure (masthead, sections, cards, tables), figure treatment…",
              fr: "Polices (via @import), palette, structure (manchette, sections, cartes, tableaux), traitement des figures…",
              pt: "Tipos de letra (via @import), paleta, estrutura (cabeçalho, secções, cartões, tabelas), tratamento das figuras…",
            })}
          />
          <TextArea
            label={t3({
              en: "Reference CSS (optional) — the exact stylesheet the AI reuses; the brief describes how to use its classes",
              fr: "CSS de référence (optionnel) — la feuille de style exacte que l'IA réutilise ; le guide décrit l'usage de ses classes",
              pt: "CSS de referência (opcional) — a folha de estilos exata que a IA reutiliza; o guia descreve como usar as suas classes",
            })}
            value={referenceCss()}
            onChange={setReferenceCss}
            rows={6}
            mono
            fullWidth
            placeholder={t3({
              en: "Filled automatically when saving a style from a report. Without it, the AI writes CSS from the brief alone (less faithful).",
              fr: "Rempli automatiquement quand le style est enregistré depuis un rapport. Sans lui, l'IA écrit le CSS à partir du guide seul (moins fidèle).",
              pt: "Preenchido automaticamente ao guardar um estilo a partir de um relatório. Sem ele, a IA escreve o CSS apenas a partir do guia (menos fiel).",
            })}
          />
          <div class="flex items-center gap-2">
            <Select
              label={t3({
                en: "Start from a preset's brief",
                fr: "Partir du guide d'un préréglage",
                pt: "Partir do guia de uma predefinição",
              })}
              options={[
                { value: "_none", label: "—" },
                ...REPORT_HTML_STYLES.filter((v) => v !== "default").map(
                  (v) => ({ value: v, label: REPORT_STYLE_BRIEFS[v].name }),
                ),
              ]}
              value={prefill()}
              onChange={applyPrefill}
            />
            <div class="text-base-content-muted ml-auto text-xs">
              {brief().length} / {REPORT_CUSTOM_BRIEF_MAX}
            </div>
          </div>
        </div>
        <div class="ui-spy-sm">
          <RadioGroup<Visibility>
            label={t3({ en: "Available in", fr: "Disponible dans", pt: "Disponível em" })}
            value={visibility()}
            onChange={setVisibility}
            horizontal
            options={[
              {
                value: "report",
                label: t3({ en: "This report", fr: "Ce rapport", pt: "Este relatório" }),
              },
              {
                value: "selected",
                label: t3({ en: "Selected reports", fr: "Rapports choisis", pt: "Relatórios escolhidos" }),
              },
              {
                value: "instance",
                label: t3({ en: "All reports", fr: "Tous les rapports", pt: "Todos os relatórios" }),
              },
            ]}
          />
          <Show when={visibility() === "selected"}>
            <div class="max-h-40 overflow-auto rounded border p-2">
              <For each={reportProducts()}>
                {(report) => (
                  <Checkbox
                    label={report.label}
                    checked={selectedReports().has(report.id)}
                    onChange={() => toggleReport(report.id)}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
        <div class="ui-spy-sm">
          <div class="ui-label">
            {t3({
              en: "Tile colors (for the style picker preview)",
              fr: "Couleurs de la vignette (aperçu dans le sélecteur)",
              pt: "Cores do mosaico (pré-visualização no seletor)",
            })}
          </div>
          <div class="flex flex-wrap gap-4">
            {colorField("page", t3({ en: "Page", fr: "Page", pt: "Página" }))}
            {colorField("ink", t3({ en: "Text", fr: "Texte", pt: "Texto" }))}
            {colorField("accent", t3({ en: "Accent", fr: "Accent", pt: "Realce" }))}
          </div>
        </div>
        <StateHolderFormError state={saveState()} />
      </div>
    </ModalContainer>
  );
}
