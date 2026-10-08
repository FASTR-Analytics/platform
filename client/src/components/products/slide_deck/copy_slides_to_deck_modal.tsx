import { type ProductSummary, t3 } from "lib";
import {
  type AlertComponentProps,
  createFormAction,
  getSelectOptionsFromIdLabel,
  ModalContainer,
  plural,
  Select,
} from "panther";
import { createMemo, createSignal } from "solid-js";
import { packageScopeCaption } from "~/components/_shared/mod.ts";
import { serverActions } from "~/server_actions";
import { canEditProduct } from "~/state/instance/product_access";
import { instanceState } from "~/state/instance/t1_store";

type Props = { sourceProductId: string; slideIds: string[] };

type ReturnType = { newSlideIds: string[] } | undefined;

// "Copy to deck…", the only cross-product figure reuse there is (D3: no figure
// library, so reuse is duplicate within a deck, duplicate the whole deck, and
// this). Bundles are copied VERBATIM, so every copied figure lands stale when
// the target deck serves from a different (package, scope) pair, which is why
// the picker names each deck's pair instead of pretending the copy is
// pair-neutral.
export function CopySlidesToDeckModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  // Only decks the user can edit: the copy writes into the destination.
  const targetDecks = createMemo(() =>
    instanceState.products.filter(
      (product): product is Extract<ProductSummary, { type: "slide_deck" }> =>
        product.type === "slide_deck" && product.id !== p.sourceProductId &&
        canEditProduct(product.id),
    )
  );

  const [targetProductId, setTargetProductId] = createSignal<string>(
    targetDecks()[0]?.id ?? "",
  );

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const targetId = targetProductId();
      if (!targetId) {
        return {
          success: false,
          err: t3({
            en: "Choose a deck to copy into",
            fr: "Choisissez une présentation de destination",
            pt: "Escolha uma apresentação de destino",
          }),
        };
      }
      return serverActions.copySlidesToSlideDeck({
        product_id: p.sourceProductId,
        slideIds: p.slideIds,
        targetProductId: targetId,
      });
    },
    (data) => {
      p.close({ newSlideIds: data.newSlideIds });
    },
  );

  const slideCount = () =>
    `${p.slideIds.length} ${
      plural(p.slideIds.length, {
        one: t3({ en: "slide", fr: "diapositive", pt: "diapositivo" }),
        other: t3({ en: "slides", fr: "diapositives", pt: "diapositivos" }),
      })
    }`;

  return (
    <ModalContainer
      title={t3({
        en: `Copy ${slideCount()} to another deck`,
        fr: `Copier ${slideCount()} vers une autre présentation`,
        pt: `Copiar ${slideCount()} para outra apresentação`,
      })}
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" }),
        onClick: save.click,
        state: save.state(),
        disabled: !targetProductId(),
      }]}
    >
      <div class="ui-spy-sm">
        <Select
          label={t3({
            en: "Destination deck",
            fr: "Présentation de destination",
            pt: "Apresentação de destino",
          })}
          options={getSelectOptionsFromIdLabel(
            targetDecks().map((deck) => ({
              id: deck.id,
              label: `${deck.label} — ${packageScopeCaption(deck)}`,
            })),
          )}
          value={targetProductId()}
          onChange={setTargetProductId}
          fullWidth
        />
        <div class="text-base-content-muted text-sm">
          {t3({
            en:
              "Visualizations are copied as they are. Any that came from a different package or scope show an update button in the destination deck.",
            fr:
              "Les visualisations sont copiées telles quelles. Celles provenant d'un autre paquet ou d'une autre portée afficheront un bouton de mise à jour dans la présentation de destination.",
            pt:
              "As visualizações são copiadas tal como estão. As que vieram de outro pacote ou âmbito mostram um botão de atualização na apresentação de destino.",
          })}
        </div>
      </div>
    </ModalContainer>
  );
}
