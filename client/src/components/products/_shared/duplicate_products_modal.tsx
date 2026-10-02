import { type ProductSummary, type ScopeId, t3 } from "lib";
import {
  type AlertComponentProps,
  createFormAction,
  getProgress,
  ModalContainer,
  plural,
  ProgressBar,
  RadioGroup,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { ScopeSelect } from "~/components/_shared/mod.ts";
import { serverActions } from "~/server_actions";

type Props = {
  products: ProductSummary[];
};

type ReturnType = { productIds: string[] } | undefined;

type ScopeChoice = "keep" | "set";

// `duplicateProduct` keeps the source's package and mints its own label (D5);
// the scope is the one thing to decide here, because a deck copied per scope
// is the way scoped products are made. The default keeps each original's
// scope, so a plain duplicate stays one click.
export function DuplicateProductsModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const progress = getProgress();
  const [scopeChoice, setScopeChoice] = createSignal<ScopeChoice>("keep");
  const [tempScopeId, setTempScopeId] = createSignal<ScopeId | undefined>();

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const chosen = scopeChoice() === "set" ? tempScopeId() : undefined;
      if (scopeChoice() === "set" && chosen === undefined) {
        return {
          success: false,
          err: t3({
            en: "Select a scope for the copies",
            fr: "Sélectionnez une portée pour les copies",
            pt: "Selecione um âmbito para as cópias",
          }),
        };
      }
      const total = p.products.length;
      const productIds: string[] = [];

      for (let i = 0; i < total; i++) {
        const product = p.products[i];
        progress.onProgress(
          i / total,
          t3({
            en: `Duplicating ${i + 1} of ${total}...`,
            fr: `Duplication de ${i + 1} sur ${total}...`,
            pt: `A duplicar ${i + 1} de ${total}...`,
          }),
        );
        const res = await serverActions.duplicateProduct({
          product_id: product.id,
          scopeId: chosen ?? product.scopeId,
        });
        if (!res.success) {
          const duplicated = `${productIds.length} ${
            plural(productIds.length, {
              one: t3({ en: "duplicated", fr: "dupliqué", pt: "duplicado" }),
              other: t3({
                en: "duplicated",
                fr: "dupliqués",
                pt: "duplicados",
              }),
            })
          }`;
          return {
            success: false,
            err: t3({
              en: `Failed on "${product.label}": ${res.err}. ${duplicated}.`,
              fr: `Échec sur « ${product.label} » : ${res.err}. ${duplicated}.`,
              pt: `Falhou em "${product.label}": ${res.err}. ${duplicated}.`,
            }),
          };
        }
        productIds.push(res.data.productId);
      }

      progress.onProgress(1, "");
      return { success: true, data: { productIds } };
    },
    (data) => {
      p.close(data);
    },
  );

  const header = () =>
    p.products.length > 1
      ? t3({
        en: `Duplicate ${p.products.length} products`,
        fr: `Dupliquer ${p.products.length} produits`,
        pt: `Duplicar ${p.products.length} produtos`,
      })
      : t3({ en: "Duplicate", fr: "Dupliquer", pt: "Duplicar" });

  return (
    <ModalContainer
      title={header()}
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" }),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div class="ui-spy-sm">
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "Each copy keeps the original's results package.",
            fr: "Chaque copie conserve le paquet de résultats de l'original.",
            pt: "Cada cópia mantém o pacote de resultados do original.",
          })}
        </div>
        <RadioGroup<ScopeChoice>
          label={t3({ en: "Scope", fr: "Portée", pt: "Âmbito" })}
          value={scopeChoice()}
          options={[
            {
              value: "keep",
              label: t3({
                en: "Keep each original's scope",
                fr: "Conserver la portée de chaque original",
                pt: "Manter o âmbito de cada original",
              }),
            },
            {
              value: "set",
              label: t3({
                en: "Set a scope for the copies",
                fr: "Définir une portée pour les copies",
                pt: "Definir um âmbito para as cópias",
              }),
            },
          ]}
          onChange={setScopeChoice}
        />
        <Show when={scopeChoice() === "set"}>
          <ScopeSelect
            scopeId={tempScopeId()}
            onChange={setTempScopeId}
            fullWidth
          />
        </Show>
        <div class="ui-spy-sm max-h-64 overflow-auto">
          <For each={p.products}>
            {(product) => (
              <div class="ui-pad-sm border-b last:border-b-0">
                <span class="flex-1 truncate">{product.label}</span>
              </div>
            )}
          </For>
        </div>
        <Show
          when={p.products.length > 1 && save.state().status === "loading"}
        >
          <ProgressBar
            progressFrom0To100={progress.progressFrom0To100()}
            progressMsg={progress.progressMsg()}
            small
          />
        </Show>
      </div>
    </ModalContainer>
  );
}
