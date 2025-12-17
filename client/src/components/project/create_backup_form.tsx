import { AlertComponentProps, AlertFormHolder, Input, timActionForm } from "panther";
import { createSignal } from "solid-js";
import { t, isFrench, APIResponseNoData } from "lib";
import { StringLiteralUnion } from "hono/utils/types";

export function CreateBackupForm(
    p: AlertComponentProps<
        {
            projectId: string;
            createBackupFunc: (backupName: string) => Promise<APIResponseNoData>;
            silentFetch?: () => Promise<void>;
        },
        "NEEDS_UPDATE"
    >
) {
    const [backupName, setBackupName] = createSignal<string>("");

    const save = timActionForm(
        async (e: MouseEvent) =>{
            e.preventDefault();
            const validName = backupName().trim();

            if(!validName) {
                return { success: false, err: t("You must enter a backup name") };
            }
            return p.createBackupFunc(validName);
        },
        p.silentFetch || (() => p.close("NEEDS_UPDATE"))
    );

    return (
        <AlertFormHolder
            formId="create-backup"
            header={t("Create Backup")}
            savingState={save.state()}
            saveFunc={save.click}
            cancelFunc={() => p.close(undefined)}
            french={isFrench}
        >
            <Input
                label={t("Backup name")}
                value={backupName()}
                onChange={setBackupName()}
                fullWidth
                autoFocus
            />
        </AlertFormHolder>
    )
}