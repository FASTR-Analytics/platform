import { t3 } from "lib";
import { AlertComponentProps, Button, Input, ModalContainer } from "panther";
import { createSignal } from "solid-js";
import { FileUploadSelector } from "~/components/_file_upload_selector";

type ReturnType = { imgFile: string; alt: string } | undefined;

// Matches the slide image model: imgFile is an instance asset. Reuses the app's
// canonical FileUploadSelector (upload via Uppy + select existing).
export function ReportImagePicker(p: AlertComponentProps<object, ReturnType>) {
  const [imgFile, setImgFile] = createSignal("");
  const [alt, setAlt] = createSignal("");

  return (
    <ModalContainer
      width="md"
      title={t3({ en: "Insert image", fr: "Insérer une image" })}
      rightButtons={
        <>
          <Button outline onClick={() => p.close(undefined)}>
            {t3({ en: "Cancel", fr: "Annuler" })}
          </Button>
          <Button
            disabled={!imgFile()}
            onClick={() => p.close({ imgFile: imgFile(), alt: alt().trim() })}
          >
            {t3({ en: "Insert", fr: "Insérer" })}
          </Button>
        </>
      }
    >
      <div class="ui-spy">
        <FileUploadSelector
          buttonLabel={t3({ en: "Upload image", fr: "Téléverser une image" })}
          selectLabel={t3({ en: "Image file", fr: "Fichier image" })}
          filter={(a) => a.isImage}
          value={imgFile()}
          onChange={setImgFile}
          fullWidth
        />
        <Input
          label={t3({
            en: "Alt text for screen readers (optional)",
            fr: "Texte alternatif pour lecteurs d'écran (facultatif)",
          })}
          value={alt()}
          onChange={setAlt}
          fullWidth
        />
      </div>
    </ModalContainer>
  );
}
