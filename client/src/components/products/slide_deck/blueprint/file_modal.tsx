import { type DeckBlueprint, parseDeckBlueprintFile, t3 } from "lib";
import { type AlertComponentProps, FileInput, ModalContainer } from "panther";
import { createSignal, Show } from "solid-js";

// Choose a blueprint file (.fastr-blueprint.json) to apply to this deck. The
// file is read and checked here; a damaged file, one that is not a
// blueprint, or one from another format version says so and is not taken.
export function BlueprintFileModal(
  p: AlertComponentProps<{ deckLabel: string }, DeckBlueprint>,
) {
  const [file, setFile] = createSignal<File | undefined>();
  const [err, setErr] = createSignal<string | undefined>();
  const [blueprint, setBlueprint] = createSignal<DeckBlueprint | undefined>();

  async function choose(f: File | undefined) {
    setFile(f);
    setErr(undefined);
    setBlueprint(undefined);
    if (!f) return;
    const res = parseDeckBlueprintFile(await f.text());
    if (res.success) setBlueprint(res.data);
    else setErr(res.err);
  }

  return (
    <ModalContainer
      width="md"
      title={t3({
        en: "Apply a blueprint",
        fr: "Appliquer un modèle",
        pt: "Aplicar um modelo",
      })}
      subtitle={t3({
        en:
          `Choose a blueprint file made from another deck (File › Make blueprint…) to apply to "${p.deckLabel}".`,
        fr:
          `Choisissez un fichier de modèle créé à partir d'une autre présentation (Fichier › Créer un modèle…) à appliquer à « ${p.deckLabel} ».`,
        pt:
          `Escolha um ficheiro de modelo criado a partir de outra apresentação (Ficheiro › Criar modelo…) para aplicar a "${p.deckLabel}".`,
      })}
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Continue", fr: "Continuer", pt: "Continuar" }),
        disabled: blueprint() === undefined,
        onClick: () => p.close(blueprint()),
      }]}
    >
      <div class="ui-spy-sm">
        <FileInput
          value={file()}
          onChange={(f) => void choose(f)}
          accept=".json,application/json"
        />
        <Show when={err()}>
          {(e) => <div class="text-danger">{e()}</div>}
        </Show>
        <Show when={blueprint()}>
          {(bp) => (
            <div>
              <div class="font-700">{bp().name}</div>
              <div class="ui-text-caption">{bp().description}</div>
              <div class="ui-text-caption">
                {t3({
                  en:
                    `${bp().topics.length} topics, made from "${bp().sourceDeckLabel}"`,
                  fr:
                    `${bp().topics.length} sujets, créé à partir de « ${bp().sourceDeckLabel} »`,
                  pt:
                    `${bp().topics.length} temas, criado a partir de "${bp().sourceDeckLabel}"`,
                })}
              </div>
            </div>
          )}
        </Show>
      </div>
    </ModalContainer>
  );
}
