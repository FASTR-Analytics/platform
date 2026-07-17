import {
  FIGURE_EXPORT_WIDTH_PX,
  type PublicDashboardBundle,
  t3,
  TC,
} from "lib";
import {
  Button,
  Checkbox,
  downloadBase64Image,
  type EditorComponentProps,
  getFigureAsBase64,
  ModalContainer,
  RadioGroup,
  StateHolderFormError,
  toPct0,
  toPct1,
} from "panther";
import { createSignal, Show } from "solid-js";
import {
  buildDashboardExportModel,
  figureInputsForDownload,
  sanitizeFilename,
  tryItemFigureInputs,
} from "~/exports/_dashboard_export_model";
import { exportDashboardAsPdf } from "~/exports/export_dashboard_as_pdf";
import { exportDashboardAsPptx } from "~/exports/export_dashboard_as_pptx";
import { exportDashboardAsXlsx } from "~/exports/export_dashboard_as_xlsx";

type Format = "png" | "pdf" | "pptx" | "xlsx";
type Scope = "current" | "all";

// Above this many figures, an "all" export needs an explicit confirm.
const COUNT_WARN_THRESHOLD = 50;

export function DownloadDashboardModal(
  p: EditorComponentProps<
    { bundle: PublicDashboardBundle; currentItemId?: string },
    undefined
  >,
) {
  const hasCurrent = () => p.currentItemId !== undefined;

  const [format, setFormat] = createSignal<Format>(
    hasCurrent() ? "png" : "pdf",
  );
  const [scope, setScope] = createSignal<Scope>(
    hasCurrent() ? "current" : "all",
  );
  const [includeAbout, setIncludeAbout] = createSignal(true);
  const [background, setBackground] = createSignal<string>("white");
  const [margin, setMargin] = createSignal<string>("padding");
  const [confirmedLarge, setConfirmedLarge] = createSignal(false);
  const [pct, setPct] = createSignal(0);
  const [err, setErr] = createSignal("");

  // `items` is the flat list of every renderable figure (group members
  // included), so its length is the "all" figure count without any hydration.
  const allCount = () => p.bundle.items.length;
  // Tables are the only figures the xlsx export can sheet; count them honestly
  // (without hydrating) so the "all" promise isn't silently broken.
  const tableCount = () =>
    p.bundle.items.filter((i) => i.bundle.config.d.type === "table").length;
  // The About text is shown as a per-page subHeader in the PDF, so only the
  // short summary is used (a long body would bloat every page header).
  const summaryAvailable = () => p.bundle.about.summary.trim().length > 0;

  // PNG has no "all" form; without a current item only PDF/PPTX/Excel make sense.
  const pptxLabel = t3({ en: "PowerPoint (.pptx)", fr: "PowerPoint (.pptx)", pt: "PowerPoint (.pptx)" });
  const xlsxLabel = t3({ en: "Excel (.xlsx)", fr: "Excel (.xlsx)", pt: "Excel (.xlsx)" });
  const formatOptions = (): { value: Format; label: string }[] =>
    hasCurrent()
      ? [
          { value: "png", label: "PNG" },
          { value: "pdf", label: "PDF" },
          { value: "pptx", label: pptxLabel },
          { value: "xlsx", label: xlsxLabel },
        ]
      : [
          { value: "pdf", label: "PDF" },
          { value: "pptx", label: pptxLabel },
          { value: "xlsx", label: xlsxLabel },
        ];

  const scopeOptions = (): { value: Scope; label: string }[] => [
    {
      value: "current",
      label: t3({ en: "This figure", fr: "Cette figure", pt: "Esta figura" }),
    },
    {
      value: "all",
      label: t3({ en: "All figures", fr: "Toutes les figures", pt: "Todas as figuras" }),
    },
  ];

  const isImageExport = () => format() === "png";
  const isXlsx = () => format() === "xlsx";
  // Excel is an all-tables data export — scope is always "all".
  const effectiveScope = (): Scope =>
    isImageExport() ? "current" : isXlsx() ? "all" : scope();
  const showScope = () => !isImageExport() && !isXlsx() && hasCurrent();
  // About text is a PDF-only page subHeader (PPTX slides have no header).
  const showAbout = () => format() === "pdf" && summaryAvailable();
  // xlsx has its own table-specific count line below.
  const showCount = () =>
    !isImageExport() && !isXlsx() && effectiveScope() === "all";
  const showLargeConfirm = () =>
    showCount() && allCount() > COUNT_WARN_THRESHOLD;
  const canDownload = () =>
    (!showLargeConfirm() || confirmedLarge()) &&
    !(isXlsx() && tableCount() === 0);

  async function attemptExport() {
    setErr("");
    setPct(0.02);
    await new Promise((res) => setTimeout(res, 0));

    if (isImageExport()) {
      const item = p.bundle.items.find((i) => i.id === p.currentItemId);
      if (!item) {
        setErr(
          t3({ en: "No figure selected", fr: "Aucune figure sélectionnée", pt: "Nenhuma figura selecionada" }),
        );
        setPct(0);
        return;
      }
      const built = tryItemFigureInputs(item);
      if (built === null) {
        setErr(
          t3({
            en: "This figure could not be rendered (its map data may be missing).",
            fr: "Cette figure n'a pas pu être générée (ses données cartographiques sont peut-être manquantes).",
            pt: "Não foi possível gerar esta figura (os seus dados cartográficos podem estar em falta).",
          }),
        );
        setPct(0);
        return;
      }
      const fi = figureInputsForDownload(
        built,
        background() === "transparent",
        margin() === "padding",
      );
      downloadBase64Image(
        getFigureAsBase64(fi, FIGURE_EXPORT_WIDTH_PX),
        `${sanitizeFilename(item.label, "figure")}.png`,
      );
      p.close(undefined);
      return;
    }

    const sc = effectiveScope();
    const model = buildDashboardExportModel(p.bundle, sc, p.currentItemId);
    const res =
      format() === "pdf"
        ? await exportDashboardAsPdf(
            model,
            { includeAbout: includeAbout() && summaryAvailable() },
            setPct,
          )
        : format() === "xlsx"
          ? await exportDashboardAsXlsx(model, setPct)
          : await exportDashboardAsPptx(model, setPct);
    if (res.success === false) {
      setErr(res.err);
      setPct(0);
      return;
    }
    p.close(undefined);
  }

  return (
    <ModalContainer
      title={t3(TC.download)}
      width="sm"
      leftButtons={
        pct() > 0
          ? undefined
          : // eslint-disable-next-line jsx-key
            [
              <Button
                onClick={attemptExport}
                intent="success"
                iconName="download"
                disabled={!canDownload()}
              >
                {t3(TC.download)}
              </Button>,
              <Button
                onClick={() => p.close(undefined)}
                intent="neutral"
                iconName="x"
              >
                {t3(TC.cancel)}
              </Button>,
            ]
      }
    >
      <div class="ui-spy">
        <RadioGroup
          label={t3({ en: "Format", fr: "Format", pt: "Formato" })}
          options={formatOptions()}
          value={format()}
          onChange={setFormat}
          horizontal
        />

        <Show when={showScope()}>
          <RadioGroup
            label={t3({ en: "Include", fr: "Inclure", pt: "Incluir" })}
            options={scopeOptions()}
            value={scope()}
            onChange={setScope}
            horizontal
          />
        </Show>

        <Show when={isImageExport()}>
          <div class="ui-gap flex">
            <RadioGroup
              label={t3({ en: "Background", fr: "Arrière-plan", pt: "Fundo" })}
              options={[
                { value: "white", label: t3({ en: "White", fr: "Blanc", pt: "Branco" }) },
                {
                  value: "transparent",
                  label: t3({ en: "Transparent", fr: "Transparent", pt: "Transparente" }),
                },
              ]}
              value={background()}
              onChange={setBackground}
            />
            <RadioGroup
              label={t3({ en: "Margin", fr: "Marge", pt: "Margem" })}
              options={[
                {
                  value: "padding",
                  label: t3({ en: "With margins", fr: "Avec marges", pt: "Com margens" }),
                },
                {
                  value: "no-padding",
                  label: t3({ en: "No margins", fr: "Sans marges", pt: "Sem margens" }),
                },
              ]}
              value={margin()}
              onChange={setMargin}
            />
          </div>
        </Show>

        <Show when={showAbout()}>
          <Checkbox
            checked={includeAbout()}
            onChange={setIncludeAbout}
            label={t3({
              en: "Include About text",
              fr: "Inclure le texte À propos",
              pt: "Incluir o texto Acerca de",
            })}
          />
        </Show>

        <Show when={showCount()}>
          <div class="text-base-content-muted text-sm">
            {t3({
              en: `This will export ${allCount()} figures.`,
              fr: `Ceci exportera ${allCount()} figures.`,
              pt: `Isto exportará ${allCount()} figuras.`,
            })}
          </div>
        </Show>

        <Show when={isXlsx()}>
          <div class="text-base-content-muted text-sm">
            {tableCount() === 0
              ? t3({
                  en: "No table figures to export.",
                  fr: "Aucun tableau à exporter.",
                  pt: "Nenhuma tabela para exportar.",
                })
              : t3({
                  en: `Exports ${tableCount()} of ${allCount()} figures (tables only).`,
                  fr: `Exporte ${tableCount()} sur ${allCount()} figures (tableaux uniquement).`,
                  pt: `Exporta ${tableCount()} de ${allCount()} figuras (apenas tabelas).`,
                })}
          </div>
        </Show>

        <Show when={showLargeConfirm()}>
          <Checkbox
            checked={confirmedLarge()}
            onChange={setConfirmedLarge}
            intentWhenChecked="warning"
            label={t3({
              en: `Yes, export all ${allCount()} figures (this may be slow).`,
              fr: `Oui, exporter les ${allCount()} figures (cela peut être lent).`,
              pt: `Sim, exportar as ${allCount()} figuras (pode ser lento).`,
            })}
          />
        </Show>
      </div>

      <Show when={pct() > 0}>
        <div class="ui-spy-sm">
          <div class="bg-base-300 h-8 w-full">
            <div
              class="bg-primary h-full"
              style={{ width: toPct1(pct()) }}
            ></div>
          </div>
          <div class="text-center">{toPct0(pct())}</div>
        </div>
      </Show>

      <Show when={pct() === 0 && err()}>
        <StateHolderFormError state={{ status: "error", err: err() }} />
      </Show>
    </ModalContainer>
  );
}
