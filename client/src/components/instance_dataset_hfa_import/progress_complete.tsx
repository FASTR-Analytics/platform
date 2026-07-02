import { t3 } from "lib";
import { Button, type ButtonAction } from "panther";

export function ProgressComplete(p: { deleteSafe: ButtonAction<[]> }) {
  return (
    <div class="ui-pad ui-spy">
      <div class="">
        {t3({ en: "This import is complete! You should now remove the upload form.", fr: "Cette importation est terminée ! Vous devez maintenant supprimer le formulaire de téléversement.", pt: "Esta importação está concluída! Deve agora remover o formulário de carregamento." })}
      </div>
      <Button
        onClick={p.deleteSafe.click}
        state={p.deleteSafe.state()}
        intent="success"
        iconName="trash"
      >
        {t3({ en: "Remove completed upload form", fr: "Supprimer le formulaire de téléversement terminé", pt: "Remover o formulário de carregamento concluído" })}
      </Button>
    </div>
  );
}
