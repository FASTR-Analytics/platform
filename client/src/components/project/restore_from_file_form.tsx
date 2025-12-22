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
                return { success: false, err: t("You must select a .sql file") };
            }

            if (!file.name.endsWith('.sql')) {
                return { success: false, err: t("Only .sql files are allowed") };
            }

            return p.restoreBackupFunc(file);
        },
        () => p.close("NEEDS_UPDATE")
    );

    return (
        <AlertFormHolder>
            <div class="flex flex-col gap-2">
                <label class="text-sm font-mdeium">
                    {t("Select SQL File")}
                </label>
                <input
                    type="file"
                    accept=".sql"
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