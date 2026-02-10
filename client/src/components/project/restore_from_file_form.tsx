import { AlertComponentProps, AlertFormHolder, timActionForm } from "panther";
import { APIResponseNoData, t3, isFrench } from "lib";
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
                return { success: false, err: t3({ en: "You must select a .sql.gz file", fr: "Vous devez sélectionner un fichier .sql.gz" }) };
            }

            if (!file.name.endsWith('.sql.gz')) {
                return { success: false, err: t3({ en: "Only .sql.gz files are allowed", fr: "Seuls les fichiers .sql.gz sont autorisés" }) };
            }

            return p.restoreBackupFunc(file);
        },
        () => p.close("NEEDS_UPDATE")
    );

    return (
        <AlertFormHolder
            formId="restore-from-file"
            header={t3({ en: "Restore from file", fr: "Restaurer depuis un fichier" })}
            savingState={save.state()}
            saveFunc={save.click}
            cancelFunc={() => p.close(undefined)}
            french={isFrench()}
        >
            <div class="flex flex-col gap-2">
                <label class="text-sm font-medium">
                    {t3({ en: "Select gzipped SQL file (.sql.gz)", fr: "Sélectionner un fichier SQL compressé (.sql.gz)" })}
                </label>
                <input
                    type="file"
                    accept=".gz"
                    onChange={handleFileChange}
                    class="block w-full text-sm"
                />
                {selectedFile() && (
                    <div class="text-sm text-neutral">
                        {t3({ en: "Selected:", fr: "Sélectionné :" })} {selectedFile()!.name}
                    </div>
                )}
            </div>
        </AlertFormHolder>
    );
}