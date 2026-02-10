import { Table, TableColumn, Button, openAlert } from "panther";
import { t3 } from "lib";
import { Show } from "solid-js";
import type { UserLog } from "lib";

type Props = {
  logs: UserLog[];
  filterByUser?: string;
  onFilterByUser: (email: string | undefined) => void;
};


export function ProjectLogs(p: Props) {
    const filteredLogs = () => {
        if (!p.filterByUser) return p.logs;
        return p.logs.filter((log) => log.user_email === p.filterByUser);
    };


    const columns: TableColumn<UserLog>[] = [
    {
        key: "timestamp",
        header: t3({ en: "Timestamp", fr: "Horodatage" }),
        sortable: true,
        render: (log) => (
        <span class="text-sm">
            {new Date(log.timestamp).toLocaleString()}
        </span>
        ),
    },
    {
        key: "user_email",
        header: t3({ en: "User", fr: "Utilisateur" }),
        sortable: true,
        render: (log) => (
        <button
            class="text-left hover:underline hover:text-primary cursor-pointer"
            onClick={(e) => {
            e.stopPropagation();
            p.onFilterByUser(p.filterByUser === log.user_email ? undefined : log.user_email);
            }}
        >
            {log.user_email}
        </button>
        ),
    },
    {
        key: "endpoint",
        header: t3({ en: "Endpoint Accessed", fr: "Point d'accès" }),
        sortable: true,
    },
    {
        key: "endpoint_result",
        header: t3({ en: "Status", fr: "Statut" }),
        sortable: true,
    },
    {
        key: "details",
        header: t3({ en: "Details", fr: "Détails" }),
        render: (log) => (
        <Show when={log.details}>
            <Button
            intent="base-100"
            size="sm"
            onClick={(e) => {
                e.stopPropagation();
                openAlert({
                title: t3({ en: "Request Details", fr: "Détails de la requête" }),
                text: (
                    <div class="whitespace-pre-wrap font-mono text-sm max-h-96 overflow-auto">
                    {formatJsonDetails(log.details!)}
                    </div>
                )
                });
            }}
            >
            {t3({ en: "View", fr: "Voir" })}
            </Button>
        </Show>
        )
    }
    ];

    return (
    <div class="flex flex-col h-full">
        <Show when={p.filterByUser}>
        <div class="flex items-center gap-2 mb-2 text-sm">
            <span class="text-neutral">{t3({ en: "Filtering by", fr: "Filtré par" })}:</span>
            <span class="font-medium">{p.filterByUser}</span>
            <Button
            size="sm"
            intent="base-100"
            iconName="x"
            onClick={() => p.onFilterByUser(undefined)}
            />
        </div>
        </Show>
        <Table
        data={filteredLogs()}
        columns={columns}
        defaultSort={{ key: "timestamp", direction: "desc" }}
        keyField="id"
        noRowsMessage={t3({ en: "No logs", fr: "Aucun journal" })}
        fitTableToAvailableHeight
        />
    </div>
    );
}

function formatJsonDetails(details: string): string {
    try {
        const parsed = JSON.parse(details);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return details; 
    }
}