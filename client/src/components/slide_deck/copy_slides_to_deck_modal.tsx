import { t3, type ProductSummary } from "lib";
import {
  type AlertComponentProps,
  AlertFormHolder,
  Select,
  createFormAction,
  getSelectOptionsFromIdLabel,
} from "panther";
import { createSignal } from "solid-js";
import { instanceState } from "~/state/instance/t1_store";
import { serverActions } from "~/server_actions";
import { packageLabel, scopeLabel } from "~/components/figure_editor/stale_figure_badge";

// "Copy to deck…" — the ONLY cross-product figure reuse there is (D3: no figure
// library, so reuse is duplicateSlides within a deck, deck duplicate, and this).
//
// Bundles are copied VERBATIM. When the target deck serves from a different
// (package, scope) pair, every copied figure lands stale there and offers its
// own "Update to <package>" — which is why the picker names each deck's pair
// rather than pretending the copy is pair-neutral.
export function CopySlidesToDeckModal(
  p: AlertComponentProps<
    { sourceDeckId: string; slideIds: string[] },
    { newSlideIds: string[] }
  >,
) {
  const targetDecks = (): ProductSummary[] =>
    instanceState.products.filter(
      (product) =>
        product.type === "slide_deck" && product.id !== p.sourceDeckId,
    );

  const [targetDeckId, setTargetDeckId] = createSignal<string>(
    targetDecks()[0]?.id ?? "",
  );

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const target = targetDeckId();
      if (!target) {
        return {
          success: false as const,
          err: t3({
            en: "Choose a deck to copy into",
            fr: "Choisissez une présentation de destination",
            pt: "Escolha uma apresentação de destino",
          }),
        };
      }
      return await serverActions.copySlidesToDeck({
        deck_id: p.sourceDeckId,
        slideIds: p.slideIds,
        targetDeckId: target,
      });
    },
    (data) => {
      p.close({ newSlideIds: data.newSlideIds });
    },
  );

  return (
    <AlertFormHolder
      formId="copy-slides-to-deck"
      header={t3({
        en: `Copy ${p.slideIds.length} slide(s) to another deck`,
        fr: `Copier ${p.slideIds.length} diapositive(s) vers une autre présentation`,
        pt: `Copiar ${p.slideIds.length} diapositivo(s) para outra apresentação`,
      })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={!targetDeckId()}
    >
      <Select
        label={t3({
          en: "Destination deck",
          fr: "Présentation de destination",
          pt: "Apresentação de destino",
        })}
        options={getSelectOptionsFromIdLabel(
          targetDecks().map((d) => ({
            id: d.id,
            label: `${d.label} — ${packageLabel(d.runId)} · ${scopeLabel(d.adminArea2)}`,
          })),
        )}
        value={targetDeckId()}
        onChange={setTargetDeckId}
        fullWidth
      />
      <div class="text-base-content-muted text-sm">
        {t3({
          en: "Figures are copied as-is. Any that came from a different package or scope will show an update button in the destination deck.",
          fr: "Les figures sont copiées telles quelles. Celles provenant d'un autre package ou d'une autre portée afficheront un bouton de mise à jour dans la présentation de destination.",
          pt: "As figuras são copiadas tal como estão. As que vieram de outro pacote ou âmbito mostrarão um botão de atualização na apresentação de destino.",
        })}
      </div>
    </AlertFormHolder>
  );
}
