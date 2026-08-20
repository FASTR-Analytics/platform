import {
  type ReportFolder,
  type ReportFormat,
  type ReportHtmlStyle,
  t3,
  TC,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  Select,
  createFormAction,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";

// Format is fixed at creation (no later switch), so the choice lives here.
function formatOption(label: string, caption: string) {
  return (
    <span class="ui-form-text select-none">
      {label}
      <span class="text-base-content-muted"> — {caption}</span>
    </span>
  );
}

// The styled presets change only the AI's authoring brief (SYSTEM_13); the
// captions here are the user-facing one-liners for each design language.
const STYLE_OPTIONS: {
  value: ReportHtmlStyle;
  label: () => string;
  description: () => string;
}[] = [
  {
    value: "default",
    label: () => t3({ en: "Platform default", fr: "Style par défaut", pt: "Estilo padrão" }),
    description: () =>
      t3({
        en: "Plain white page; the AI keeps styling minimal.",
        fr: "Page blanche sobre ; l'IA garde une mise en forme minimale.",
        pt: "Página branca simples; a IA mantém a formatação mínima.",
      }),
  },
  {
    value: "editorial",
    label: () => t3({ en: "Editorial", fr: "Éditorial", pt: "Editorial" }),
    description: () =>
      t3({
        en: "Magazine-style briefing — masthead, cards, badges, stat strips.",
        fr: "Style magazine — manchette, cartes, badges, bandeaux de chiffres.",
        pt: "Estilo revista — cabeçalho, cartões, distintivos, faixas de números.",
      }),
  },
  {
    value: "swiss",
    label: () => t3({ en: "Swiss / International", fr: "Suisse / International", pt: "Suíço / Internacional" }),
    description: () =>
      t3({
        en: "Strict grid, huge headlines, one red accent, nothing decorative.",
        fr: "Grille stricte, très grands titres, un seul accent rouge, aucun décor.",
        pt: "Grelha rigorosa, títulos enormes, um único vermelho, nada decorativo.",
      }),
  },
  {
    value: "bauhaus",
    label: () => t3({ en: "Bauhaus", fr: "Bauhaus", pt: "Bauhaus" }),
    description: () =>
      t3({
        en: "Primary-color geometry — blocks, circles and bars as ornament.",
        fr: "Géométrie en couleurs primaires — blocs, cercles et barres en ornement.",
        pt: "Geometria em cores primárias — blocos, círculos e barras como ornamento.",
      }),
  },
  {
    value: "blueprint",
    label: () => t3({ en: "Blueprint", fr: "Blueprint", pt: "Blueprint" }),
    description: () =>
      t3({
        en: "White line-work on blueprint blue; every figure a numbered plate.",
        fr: "Tracés blancs sur bleu de plan ; chaque figure devient une planche numérotée.",
        pt: "Traços brancos sobre azul de planta; cada figura é uma prancha numerada.",
      }),
  },
  {
    value: "broadsheet",
    label: () => t3({ en: "Broadsheet", fr: "Journal grand format", pt: "Jornal de grande formato" }),
    description: () =>
      t3({
        en: "Newspaper front page — masthead, columns, kickers, drop caps.",
        fr: "Une de journal — manchette, colonnes, surtitres, lettrines.",
        pt: "Primeira página de jornal — cabeçalho, colunas, antetítulos, capitulares.",
      }),
  },
  {
    value: "risograph",
    label: () => t3({ en: "Risograph", fr: "Risographie", pt: "Risografia" }),
    description: () =>
      t3({
        en: "Two-ink zine print — paper tint, offset shadows, stamped labels.",
        fr: "Impression deux encres façon zine — papier teinté, ombres décalées, tampons.",
        pt: "Impressão a duas tintas estilo zine — papel tingido, sombras desalinhadas, carimbos.",
      }),
  },
  {
    value: "artdeco",
    label: () => t3({ en: "Art deco", fr: "Art déco", pt: "Art déco" }),
    description: () =>
      t3({
        en: "1920s programme — symmetric, gilded rules and ornaments, small caps.",
        fr: "Programme années 1920 — symétrie, filets et ornements dorés, petites capitales.",
        pt: "Programa anos 1920 — simetria, filetes e ornamentos dourados, versaletes.",
      }),
  },
  {
    value: "japanese",
    label: () => t3({ en: "Japanese minimal", fr: "Minimalisme japonais", pt: "Minimalismo japonês" }),
    description: () =>
      t3({
        en: "Extreme whitespace, quiet type, a single vermilion seal.",
        fr: "Espace blanc extrême, typographie discrète, un unique sceau vermillon.",
        pt: "Espaço em branco extremo, tipografia discreta, um único selo vermelhão.",
      }),
  },
  {
    value: "monochrome",
    label: () => t3({ en: "Monochrome ink", fr: "Encre monochrome", pt: "Tinta monocromática" }),
    description: () =>
      t3({
        en: "Pure black on white — your charts become the only color on the page.",
        fr: "Noir pur sur blanc — vos graphiques deviennent la seule couleur de la page.",
        pt: "Preto puro sobre branco — os gráficos tornam-se a única cor da página.",
      }),
  },
  {
    value: "terminal",
    label: () => t3({ en: "Terminal", fr: "Terminal", pt: "Terminal" }),
    description: () =>
      t3({
        en: "Phosphor green on near-black, monospace everything, CLI furniture.",
        fr: "Vert phosphore sur quasi-noir, tout en chasse fixe, habillage type console.",
        pt: "Verde fósforo sobre quase preto, tudo monoespaçado, elementos de consola.",
      }),
  },
  {
    value: "brutalist",
    label: () => t3({ en: "Brutalist", fr: "Brutaliste", pt: "Brutalista" }),
    description: () =>
      t3({
        en: "Raw and loud — harsh borders, hard shadows, highlighter yellow.",
        fr: "Brut et criard — bordures dures, ombres franches, jaune surligneur.",
        pt: "Cru e ruidoso — margens duras, sombras rígidas, amarelo marcador.",
      }),
  },
];

export function AddReportForm(
  p: AlertComponentProps<
    { projectId: string; folders: ReportFolder[]; currentFolderId: string | null },
    { newReportId: string }
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>("");
  const [tempFolderId, setTempFolderId] = createSignal<string>(
    p.currentFolderId ?? "_none",
  );
  const [tempFormat, setTempFormat] = createSignal<ReportFormat>("markdown");
  const [tempHtmlStyle, setTempHtmlStyle] = createSignal<ReportHtmlStyle>("default");

  const folderOptions = () => [
    { value: "_none", label: t3(TC.general) },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      if (!tempLabel().trim()) {
        return { success: false, err: t3({ en: "You must enter a label", fr: "Vous devez saisir un libellé", pt: "Tem de introduzir um rótulo" }) };
      }
      const folderId = tempFolderId() === "_none" ? null : tempFolderId();
      return await serverActions.createReport({
        projectId: p.projectId,
        label: tempLabel().trim(),
        folderId,
        format: tempFormat(),
        htmlStyle: tempFormat() === "html" ? tempHtmlStyle() : undefined,
      });
    },
    (data) => p.close({ newReportId: data.reportId }),
  );

  return (
    <AlertFormHolder
      formId="add-report"
      header={t3({ en: "Create report", fr: "Créer un rapport", pt: "Criar relatório" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "Report name", fr: "Nom du rapport", pt: "Nome do relatório" })}
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
        <Select
          label={t3(TC.folder)}
          options={folderOptions()}
          value={tempFolderId()}
          onChange={setTempFolderId}
          fullWidth
        />
        <RadioGroup<ReportFormat>
          label={t3({ en: "Format", fr: "Format", pt: "Formato" })}
          value={tempFormat()}
          onChange={setTempFormat}
          options={[
            {
              value: "markdown",
              label: formatOption(
                t3({ en: "Markdown", fr: "Markdown", pt: "Markdown" }),
                t3({
                  en: "simple text formatting; exports to PDF and Word",
                  fr: "mise en forme simple ; export PDF et Word",
                  pt: "formatação simples; exporta para PDF e Word",
                }),
              ),
            },
            {
              value: "html",
              label: formatOption(
                t3({ en: "HTML", fr: "HTML", pt: "HTML" }),
                t3({
                  en: "custom layout and styling; exports to HTML and print/PDF",
                  fr: "mise en page et styles personnalisés ; export HTML et impression/PDF",
                  pt: "layout e estilos personalizados; exporta para HTML e impressão/PDF",
                }),
              ),
            },
          ]}
        />
        <Show when={tempFormat() === "html"}>
          <div class="ui-spy-sm">
            <Select<ReportHtmlStyle>
              label={t3({ en: "Style", fr: "Style", pt: "Estilo" })}
              options={STYLE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label(),
              }))}
              value={tempHtmlStyle()}
              onChange={setTempHtmlStyle}
              fullWidth
            />
            <div class="text-base-content-muted text-xs">
              {STYLE_OPTIONS.find((o) => o.value === tempHtmlStyle())
                ?.description()}
            </div>
          </div>
        </Show>
      </div>
    </AlertFormHolder>
  );
}
