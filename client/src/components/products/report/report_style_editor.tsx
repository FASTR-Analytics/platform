import { type ReportCustomStyle, type ReportStyleColors, t3 } from "lib";
import {
  type AlertComponentProps,
  Button,
  Checkbox,
  Input,
  ModalContainer,
  RadioGroup,
  type StateHolderFormAction,
  StateHolderFormError,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

// Create / edit one custom report style (a library row in the MAIN db): a
// palette that overrides the report theme's colors.
// Opened from the style picker's "+ New style" tile / edit affordance (as a
// wizard step, one panther modal slot). Delete lives here (not on picker
// tiles) because openConfirm would replace the picker modal.
//
// Visibility is per PRODUCT: this report, a
// chosen set of reports, or every report on the instance.

export type ReportStyleEditorResult = { saved: true };

type Visibility = "report" | "selected" | "instance";

type Props = AlertComponentProps<
  {
    productId: string;
    existing?: ReportCustomStyle;
  },
  ReportStyleEditorResult
>;

const DEFAULT_COLORS: ReportStyleColors = {
  page: "#FFFFFF",
  ink: "#222222",
  accent: "#2A6FA8",
};

export function ReportStyleEditor(p: Props) {
  const base = p.existing;
  const [label, setLabel] = createSignal(base?.label ?? "");
  const [description, setDescription] = createSignal(base?.description ?? "");
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
  const [visibility, setVisibility] = createSignal<Visibility>(
    initialVisibility,
  );
  const [selectedReports, setSelectedReports] = createSignal<Set<string>>(
    new Set(
      p.existing?.productIds ?? [p.productId],
    ),
  );
  const reportProducts = () =>
    instanceState.products.filter((product) => product.type === "report");
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

  async function save() {
    if (saveState().status === "loading") return;
    if (!label().trim()) {
      setSaveState({
        status: "error",
        err: t3({
          en: "You must enter a name",
          fr: "Vous devez saisir un nom",
          pt: "Tem de introduzir um nome",
        }),
      });
      return;
    }
    setSaveState({ status: "loading" });
    // brief and referenceCss are no longer edited here (see
    // lib/types/report_styles.ts): an existing style's stored values are sent
    // back unchanged so a save does not wipe them.
    const body = {
      label: label().trim(),
      description: description().trim(),
      brief: p.existing?.brief ?? "",
      referenceCss: p.existing?.referenceCss ?? null,
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
        onInput={(e) =>
          setColors({ ...colors(), [key]: e.currentTarget.value })}
        class="h-7 w-9 cursor-pointer rounded border p-0"
      />
      <span class="ui-form-text">{labelText}</span>
    </label>
  );

  return (
    <ModalContainer
      width="lg"
      title={p.existing
        ? t3({
          en: "Edit custom style",
          fr: "Modifier le style personnalisé",
          pt: "Editar estilo personalizado",
        })
        : t3({
          en: "New custom style",
          fr: "Nouveau style personnalisé",
          pt: "Novo estilo personalizado",
        })}
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
              ? t3({
                en: "Confirm delete",
                fr: "Confirmer la suppression",
                pt: "Confirmar eliminação",
              })
              : t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" })}
          </Button>
        )
        : undefined}
      actions={[{
        label: t3({
          en: "Save style",
          fr: "Enregistrer le style",
          pt: "Guardar estilo",
        }),
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
          autoFocus
        />
        <Input
          label={t3({
            en: "Short description",
            fr: "Description courte",
            pt: "Descrição curta",
          })}
          value={description()}
          onChange={setDescription}
          fullWidth
        />
        <div class="ui-spy-sm">
          <RadioGroup<Visibility>
            label={t3({
              en: "Available in",
              fr: "Disponible dans",
              pt: "Disponível em",
            })}
            value={visibility()}
            onChange={setVisibility}
            horizontal
            options={[
              {
                value: "report",
                label: t3({
                  en: "This report",
                  fr: "Ce rapport",
                  pt: "Este relatório",
                }),
              },
              {
                value: "selected",
                label: t3({
                  en: "Selected reports",
                  fr: "Rapports choisis",
                  pt: "Relatórios escolhidos",
                }),
              },
              {
                value: "instance",
                label: t3({
                  en: "All reports",
                  fr: "Tous les rapports",
                  pt: "Todos os relatórios",
                }),
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
            {colorField(
              "accent",
              t3({ en: "Accent", fr: "Accent", pt: "Realce" }),
            )}
          </div>
        </div>
        <StateHolderFormError state={saveState()} />
      </div>
    </ModalContainer>
  );
}
