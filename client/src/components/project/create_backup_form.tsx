import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { t3, APIResponseNoData } from "lib";

function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

export function CreateBackupForm(
  p: AlertComponentProps<
    {
      projectId: string;
      createBackupFunc: (backupName: string) => Promise<APIResponseNoData>;
      silentFetch?: () => Promise<void>;
    },
    "NEEDS_UPDATE"
  >,
) {
  const [backupName, setBackupName] = createSignal<string>(getTimestamp());

  const save = p.silentFetch
    ? createFormAction(
        async (e: MouseEvent) => {
          e.preventDefault();
          const validName = backupName().trim();

          if (!validName) {
            return { success: false, err: t3({ en: "You must enter a backup name", fr: "Vous devez saisir un nom de sauvegarde", pt: "Tem de introduzir um nome para a cópia de segurança" }) };
          }
          return p.createBackupFunc(validName);
        },
        p.silentFetch,
        () => p.close("NEEDS_UPDATE"),
      )
    : createFormAction(
        async (e: MouseEvent) => {
          e.preventDefault();
          const validName = backupName().trim();

          if (!validName) {
            return { success: false, err: t3({ en: "You must enter a backup name", fr: "Vous devez saisir un nom de sauvegarde", pt: "Tem de introduzir um nome para a cópia de segurança" }) };
          }
          return p.createBackupFunc(validName);
        },
        () => p.close("NEEDS_UPDATE"),
      );

  return (
    <AlertFormHolder
      formId="create-backup"
      header={t3({ en: "Create Backup", fr: "Créer une sauvegarde", pt: "Criar cópia de segurança" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <Input
        label={t3({ en: "Backup name", fr: "Nom de la sauvegarde", pt: "Nome da cópia de segurança" })}
        value={backupName()}
        onChange={setBackupName}
        fullWidth
        autoFocus
      />
    </AlertFormHolder>
  );
}
