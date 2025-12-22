import { AlertComponentProps, AlertFormHolder, timActionForm } from "panther";
import { APIResponseNoData, t, isFrench } from "lib";
import { createSignal } from "solid-js";

export function CreateRestoreFromFileForm(
    p: AlertComponentProps<
        {
            restoreBackupFunc: (file: File) => Promise<APIResponseNoData>;
        },
        "NEEDS_UPDATE"
    >
) {
    const [selectedFile, setSelectedFile] = createSignal<File | null>(null);

    const handleFileChange = (e: Event) => {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            setSelectedFile(input.files[0]);
        }
    };

    const save = timActionForm(
        async (e: MouseEvent) => {
            e.preventDefault();
            const file = selectedFile();

            if (!file) {
                return { success: false, err: t("You must select a .sql.gz file") };
            }

            if (!file.name.endsWith('.sql.gz')) {
                return { success: false, err: t("Only .sql.gz files are allowed") };
            }

            return p.restoreBackupFunc(file);
        },
        () => p.close("NEEDS_UPDATE")
    );

    return (
        <AlertFormHolder
            formId="restore-from-file"
            header={t("Restore from file")}
            savingState={save.state()}
            saveFunc={save.click}
            cancelFunc={() => p.close(undefined)}
            french={isFrench()}
        >
            <div class="flex flex-col gap-2">
                <label class="text-sm font-medium">
                    {t("Select gzipped SQL file (.sql.gz)")}
                </label>
                <input
                    type="file"
                    accept=".gz,.sql.gz"
                    onChange={handleFileChange}
                    class="block w-full text-sm"
                />
                {selectedFile() && (
                    <div class="text-sm text-neutral">
                        Selected: {selectedFile()!.name}
                    </div>
                )}
            </div>
        </AlertFormHolder>
    );
}