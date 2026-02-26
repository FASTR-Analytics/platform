import {
  ProjectDetail,
  ReportConfig,
  ReportItem,
  ReportItemContentItem,
  SlideDeckConfig,
  getColorDetailsForColorTheme,
  ReplicantValueOverride,
  PresentationObjectConfig,
  t3,
} from "lib";
import type {
  Slide,
  CoverSlide,
  SectionSlide,
  ContentSlide,
  ContentBlock,
  FigureBlock,
  TextBlock,
  ImageBlock,
  FigureSource,
} from "lib";
import type { LayoutNode } from "@timroberton/panther";
import {
  Button,
  EditorComponentProps,
  ModalContainer,
  toPct0,
  toPct1,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  getPODetailFromCacheorFetch,
  getPOFigureInputsFromCacheOrFetch,
} from "~/state/po_cache";

type Props = {
  projectDetail: ProjectDetail;
};

export function MigrateReportsToSlides(
  p: EditorComponentProps<Props, undefined>,
) {
  const [pct, setPct] = createSignal(0);
  const [err, setErr] = createSignal("");
  const [done, setDone] = createSignal(false);
  const [log, setLog] = createSignal<string[]>([]);

  const slideDeckReports = () =>
    p.projectDetail.reports.filter((r) => r.reportType === "slide_deck");

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  async function runMigration() {
    setErr("");
    setPct(0.01);
    await new Promise((r) => setTimeout(r, 0));

    const reports = slideDeckReports();
    if (reports.length === 0) {
      setErr("No slide deck reports to migrate");
      setPct(0);
      return;
    }

    try {
      const folderRes = await serverActions.createSlideDeckFolder({
        projectId: p.projectDetail.id,
        label: "Old reports",
      });
      if (!folderRes.success) {
        setErr("Failed to create folder: " + folderRes.err);
        setPct(0);
        return;
      }
      const folderId = folderRes.data.folderId;
      addLog(`Created "Old reports" folder`);

      let totalItems = 0;
      const reportDataList: {
        report: { config: ReportConfig; label: string };
        items: ReportItem[];
        itemIdsInOrder: string[];
      }[] = [];

      for (const report of reports) {
        const backupRes = await serverActions.backupReport({
          projectId: p.projectDetail.id,
          report_id: report.id,
        });
        if (!backupRes.success) {
          addLog(`Skipping report "${report.label}": ${backupRes.err}`);
          continue;
        }
        const { report: reportDetail, reportItems } = backupRes.data;
        totalItems += reportDetail.itemIdsInOrder.length;
        reportDataList.push({
          report: { config: reportDetail.config, label: reportDetail.config.label },
          items: reportItems,
          itemIdsInOrder: reportDetail.itemIdsInOrder,
        });
      }

      let processedItems = 0;

      for (const { report, items, itemIdsInOrder } of reportDataList) {
        const deckRes = await serverActions.createSlideDeck({
          projectId: p.projectDetail.id,
          label: report.label || "Untitled",
          folderId,
        });
        if (!deckRes.success) {
          addLog(`Failed to create deck for "${report.label}": ${deckRes.err}`);
          continue;
        }
        const deckId = deckRes.data.deckId;

        const slideDeckConfig = mapReportConfigToSlideDeckConfig(report.config);
        await serverActions.updateSlideDeckConfig({
          projectId: p.projectDetail.id,
          deck_id: deckId,
          config: slideDeckConfig,
        });

        const itemMap = new Map(items.map((item) => [item.id, item]));

        for (const itemId of itemIdsInOrder) {
          const item = itemMap.get(itemId);
          if (!item) {
            processedItems++;
            setPct(processedItems / totalItems);
            continue;
          }

          const slide = await convertReportItemToSlide(
            item,
            p.projectDetail.id,
            addLog,
          );

          await serverActions.createSlide({
            projectId: p.projectDetail.id,
            deck_id: deckId,
            position: { toEnd: true },
            slide,
          });

          processedItems++;
          setPct(processedItems / totalItems);
        }

        addLog(`Migrated "${report.label}" (${itemIdsInOrder.length} slides)`);
      }

      setPct(1);
      setDone(true);
      addLog(`Migration complete!`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
      setPct(0);
    }
  }

  return (
    <ModalContainer
      title={t3({ en: "Migrate reports to slides", fr: "Migrer les rapports vers les diapositives" })}
      width="sm"
      leftButtons={
        done()
          ? [
              <Button onClick={() => p.close(undefined)} intent="primary">
                {t3({ en: "Done", fr: "Terminé" })}
              </Button>,
            ]
          : pct() > 0
            ? undefined
            : [
                <Button onClick={runMigration} intent="success">
                  {t3({ en: "Start migration", fr: "Démarrer la migration" })}
                </Button>,
                <Button onClick={() => p.close(undefined)} intent="neutral" iconName="x">
                  {t3({ en: "Cancel", fr: "Annuler" })}
                </Button>,
              ]
      }
    >
      <Show when={pct() === 0 && !done()}>
        <div>
          {t3({
            en: `Found ${slideDeckReports().length} slide deck report(s) to migrate. This will create new slide decks in an "Old reports" folder.`,
            fr: `${slideDeckReports().length} rapport(s) de type présentation trouvé(s) à migrer. Cela créera de nouvelles présentations dans un dossier "Old reports".`,
          })}
        </div>
      </Show>
      <Show when={pct() > 0 && !done()}>
        <div class="ui-spy-sm">
          <div class="bg-base-300 h-8 w-full">
            <div
              class="bg-primary h-full transition-all"
              style={{ width: toPct1(pct()) }}
            />
          </div>
          <div class="text-center">{toPct0(pct())}</div>
        </div>
      </Show>
      <Show when={log().length > 0}>
        <div class="text-neutral max-h-48 overflow-y-auto text-sm">
          {log().map((msg) => (
            <div>{msg}</div>
          ))}
        </div>
      </Show>
      <Show when={err()}>
        <div class="text-danger text-sm">{err()}</div>
      </Show>
    </ModalContainer>
  );
}

function mapReportConfigToSlideDeckConfig(rc: ReportConfig): SlideDeckConfig {
  const colorDetails = getColorDetailsForColorTheme(rc.colorTheme);
  return {
    label: rc.label,
    selectedReplicantValue: rc.selectedReplicantValue,
    logos: rc.logos,
    logoSize: rc.logoSize,
    figureScale: rc.figureScale,
    deckFooter: rc.footer ? { text: rc.footer, logos: [] } : undefined,
    showPageNumbers: rc.showPageNumbers,
    headerSize: rc.headerSize,
    useWatermark: rc.useWatermark,
    watermarkText: rc.watermarkText,
    primaryColor: colorDetails.primaryBackgroundColor,
    overlay: rc.overlay,
  };
}

async function convertReportItemToSlide(
  item: ReportItem,
  projectId: string,
  addLog: (msg: string) => void,
): Promise<Slide> {
  const c = item.config;

  switch (c.type) {
    case "cover": {
      const slide: CoverSlide = {
        type: "cover",
        title: c.cover.titleText ?? "",
        subtitle: c.cover.subTitleText,
        presenter: c.cover.presenterText,
        date: c.cover.dateText,
        logos: c.cover.logos,
        titleTextRelFontSize: c.cover.titleTextRelFontSize,
        subTitleTextRelFontSize: c.cover.subTitleTextRelFontSize,
        presenterTextRelFontSize: c.cover.presenterTextRelFontSize,
        dateTextRelFontSize: c.cover.dateTextRelFontSize,
      };
      return slide;
    }

    case "section": {
      const slide: SectionSlide = {
        type: "section",
        sectionTitle: c.section.sectionText ?? "",
        sectionSubtitle: c.section.smallerSectionText,
        sectionTextRelFontSize: c.section.sectionTextRelFontSize,
        smallerSectionTextRelFontSize: c.section.smallerSectionTextRelFontSize,
      };
      return slide;
    }

    case "freeform": {
      const layout = await convertLayoutNode(
        c.freeform.content,
        projectId,
        addLog,
      );
      const slide: ContentSlide = {
        type: "content",
        header: c.freeform.useHeader ? c.freeform.headerText : undefined,
        subHeader: c.freeform.useHeader ? c.freeform.subHeaderText : undefined,
        date: c.freeform.useHeader ? c.freeform.dateText : undefined,
        headerLogos: c.freeform.useHeader ? c.freeform.headerLogos : undefined,
        footer: c.freeform.useFooter ? c.freeform.footerText : undefined,
        footerLogos: c.freeform.useFooter ? c.freeform.footerLogos : undefined,
        layout,
      };
      return slide;
    }
  }
}

async function convertLayoutNode(
  node: LayoutNode<ReportItemContentItem>,
  projectId: string,
  addLog: (msg: string) => void,
): Promise<LayoutNode<ContentBlock>> {
  if (node.type === "item") {
    const block = await convertContentItem(node.data, projectId, addLog);
    return {
      type: "item",
      id: node.id,
      data: block,
      span: node.span,
    };
  }

  const children = await Promise.all(
    (node.children ?? []).map((child) => convertLayoutNode(child, projectId, addLog)),
  );
  return {
    type: node.type,
    id: node.id,
    children,
    span: node.span,
  };
}

async function convertContentItem(
  item: ReportItemContentItem,
  projectId: string,
  addLog: (msg: string) => void,
): Promise<ContentBlock> {
  switch (item.type) {
    case "text": {
      const block: TextBlock = {
        type: "text",
        markdown: item.markdown ?? "",
        style: {
          textSize: item.textSize,
          textBackground: item.textBackground !== "none" ? item.textBackground : undefined,
        },
      };
      return block;
    }

    case "image": {
      const block: ImageBlock = {
        type: "image",
        imgFile: item.imgFile ?? "",
        style: {
          imgFit: item.imgFit === "inside" ? "contain" : "cover",
        },
      };
      return block;
    }

    case "figure": {
      const poInfo = item.presentationObjectInReportInfo;
      if (!poInfo) {
        return { type: "text", markdown: "[Empty figure]" };
      }

      const poDetailRes = await getPODetailFromCacheorFetch(projectId, poInfo.id);
      if (!poDetailRes.success) {
        addLog(`Figure PO not found: ${poInfo.id}`);
        return { type: "text", markdown: "[Missing figure]" };
      }

      const override: ReplicantValueOverride = {
        selectedReplicantValue: poInfo.selectedReplicantValue || undefined,
        additionalScale: item.useFigureAdditionalScale ? item.figureAdditionalScale ?? undefined : undefined,
        hideFigureCaption: item.hideFigureCaption,
        hideFigureSubCaption: item.hideFigureSubCaption,
        hideFigureFootnote: item.hideFigureFootnote,
      };

      const configForSource: PresentationObjectConfig = structuredClone(poDetailRes.data.config);
      if (override.selectedReplicantValue) {
        configForSource.d.selectedReplicantValue = override.selectedReplicantValue;
      }
      if (override.hideFigureCaption) {
        configForSource.t.caption = "";
      }
      if (override.hideFigureSubCaption) {
        configForSource.t.subCaption = "";
      }
      if (override.hideFigureFootnote) {
        configForSource.t.footnote = "";
      }

      const source: FigureSource = {
        type: "from_data",
        metricId: poInfo.metricId,
        config: configForSource,
        snapshotAt: new Date().toISOString(),
      };

      const figureInputsRes = await getPOFigureInputsFromCacheOrFetch(
        projectId,
        poInfo.id,
        override,
      );

      const block: FigureBlock = {
        type: "figure",
        figureInputs: figureInputsRes.success ? figureInputsRes.data : undefined,
        source,
      };

      if (!figureInputsRes.success) {
        addLog(`Figure render failed for PO ${poInfo.id}: ${figureInputsRes.err}`);
      }

      return block;
    }
  }
}
