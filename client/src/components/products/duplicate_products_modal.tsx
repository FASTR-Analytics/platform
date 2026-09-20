import { t3, type ProductSummary } from "lib";
import {
  AlertFormHolder,
  ProgressBar,
  RadioGroup,
  createFormAction,
  getProgress,
  type AlertComponentProps,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import {
  ScopePicker,
  storedValueFromScopeSelection,
  type ScopeSelection,
} from "~/components/_shared/scope_picker";
import { serverActions } from "~/server_actions";

type Props = {
  products: ProductSummary[];
};

type ReturnType = { productIds: string[] } | undefined;

type ScopeChoice = "keep" | "set";

// `duplicateProduct` keeps the source's package and mints its own label (D5);
// the scope is the one thing to decide here, because a national deck copied
// per area is the way area products are made. The default keeps each
// original's scope, so a plain duplicate stays one click.
export function DuplicateProductsModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const progress = getProgress();
  const [scopeChoice, setScopeChoice] = createSignal<ScopeChoice>("keep");
  const [tempScope, setTempScope] = createSignal<ScopeSelection>({
    mode: "national",
  });

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const chosen =
        scopeChoice() === "set"
          ? storedValueFromScopeSelection(tempScope())
          : undefined;
      if (scopeChoice() === "set" && chosen === undefined) {
        return {
          success: false,
          err: t3({
            en: "Select an area, or choose national scope",
            fr: "Sélectionnez une zone ou choisissez la portée nationale",
            pt: "Selecione uma zona ou escolha o âmbito nacional",
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
          adminArea2: chosen === undefined ? product.adminArea2 : chosen,
        });
        if (!res.success) {
          return {
            success: false,
            err: t3({
              en: `Failed on "${product.label}": ${res.err}. ${productIds.length} duplicated.`,
              fr: `Échec sur « ${product.label} » : ${res.err}. ${productIds.length} dupliqué(s).`,
              pt: `Falhou em "${product.label}": ${res.err}. ${productIds.length} duplicado(s).`,
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
    <AlertFormHolder
      formId="duplicate-products"
      header={header()}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
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
          <ScopePicker selection={tempScope()} onChange={setTempScope} />
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
    </AlertFormHolder>
  );
}
