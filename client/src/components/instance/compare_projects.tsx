import {
  MODULE_REGISTRY,
  t3,
  TC,
  type CompareProjectsData,
  type CompareProjectsModule,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  timQuery,
} from "panther";
import { For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

export function CompareProjects(p: EditorComponentProps<{}, undefined>) {
  const query = timQuery(
    () => serverActions.compareProjects({}),
    t3({
      en: "Loading comparison data...",
      fr: "Chargement des données de comparaison...",
    }),
  );

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en: "Compare projects", fr: "Comparer les projets" })}
          </div>
          <div class="ui-gap-sm flex items-center">
            {/* <Button iconName="refresh" onClick={datasetDetail.fetch} /> */}
          </div>
        </div>
      }
    >
      <StateHolderWrapper state={query.state()}>
        {(data: CompareProjectsData) => <ComparisonTable data={data} />}
      </StateHolderWrapper>
    </FrameTop>
  );
}

function ComparisonTable(p: { data: CompareProjectsData }) {
  const projects = () => p.data.projects;

  function getModule(
    projectIndex: number,
    moduleId: string,
  ): CompareProjectsModule | undefined {
    return projects()[projectIndex].modules.find((m) => m.id === moduleId);
  }

  function allParameterKeys(
    moduleId: string,
  ): { replacementString: string; description: string }[] {
    const seen = new Map<string, string>();
    for (const project of projects()) {
      const mod = project.modules.find((m) => m.id === moduleId);
      if (mod) {
        for (const param of mod.parameters) {
          if (!seen.has(param.replacementString)) {
            seen.set(param.replacementString, param.description);
          }
        }
      }
    }
    return Array.from(seen.entries()).map(
      ([replacementString, description]) => ({
        replacementString,
        description,
      }),
    );
  }

  function isInconsistent(moduleId: string, getValue: (mod: CompareProjectsModule) => string | undefined): boolean {
    const values: string[] = [];
    for (const project of projects()) {
      const mod = project.modules.find((m) => m.id === moduleId);
      if (mod) {
        const v = getValue(mod);
        if (v !== undefined) values.push(v);
      }
    }
    if (values.length <= 1) return false;
    return values.some((v) => v !== values[0]);
  }

  function rowHeaderClass(moduleId: string, getValue: (mod: CompareProjectsModule) => string | undefined): string {
    const danger = isInconsistent(moduleId, getValue);
    return danger
      ? "text-danger bg-danger/5 ui-pad-sm sticky left-0 pl-6 text-xs"
      : "text-neutral ui-pad-sm sticky left-0 bg-base-100 pl-6 text-xs";
  }

  function rowCellClass(moduleId: string, getValue: (mod: CompareProjectsModule) => string | undefined, base: string): string {
    return isInconsistent(moduleId, getValue)
      ? `${base} bg-danger/5`
      : base;
  }

  function dirtyBadge(dirty: string) {
    const cls =
      dirty === "ready"
        ? "bg-success/15 text-success"
        : dirty === "error"
          ? "bg-danger/15 text-danger"
          : "bg-warning/15 text-warning";
    return (
      <span class={`font-500 rounded px-1.5 py-0.5 text-xs ${cls}`}>
        {dirty}
      </span>
    );
  }

  return (
    <div class="ui-pad">
      <table class="border-base-300 w-full border-collapse border text-sm">
        <thead>
          <tr class="border-base-300 border-b">
            <th class="text-neutral ui-pad-sm font-500 sticky left-0 bg-base-100 text-left"></th>
            <For each={projects()}>
              {(project) => (
                <th class="ui-pad-sm font-600 text-left whitespace-nowrap">
                  {project.label}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={MODULE_REGISTRY}>
            {(registryMod) => {
              const params = allParameterKeys(registryMod.id);
              const anyInstalled = projects().some((proj) =>
                proj.modules.some((m) => m.id === registryMod.id),
              );
              return (
                <>
                  <tr class="border-base-300 bg-base-200/50 border-b">
                    <td class="ui-pad-sm font-600 sticky left-0 bg-base-200">
                      {t3(registryMod.label)}
                    </td>
                    <For each={projects()}>
                      {(_, i) => {
                        const mod = getModule(i(), registryMod.id);
                        return (
                          <td class="ui-pad-sm">
                            <Show
                              when={mod}
                              fallback={<span class="text-neutral">—</span>}
                            >
                              {dirtyBadge(mod!.dirty)}
                            </Show>
                          </td>
                        );
                      }}
                    </For>
                  </tr>
                  <Show when={anyInstalled}>
                    <tr class="border-base-300 border-b">
                      <td class={rowHeaderClass(registryMod.id, (m) => m.installedGitRef)}>
                        {t3({ en: "Installed SHA", fr: "SHA installé" })}
                      </td>
                      <For each={projects()}>
                        {(_, i) => {
                          const mod = getModule(i(), registryMod.id);
                          return (
                            <td class={rowCellClass(registryMod.id, (m) => m.installedGitRef, "ui-pad-sm font-mono text-xs")}>
                              {mod?.installedGitRef?.slice(0, 7) ?? (
                                <span class="text-neutral">—</span>
                              )}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                    <tr class="border-base-300 border-b">
                      <td class="text-neutral ui-pad-sm sticky left-0 bg-base-100 pl-6 text-xs">
                        {t3({ en: "Installed at", fr: "Installé le" })}
                      </td>
                      <For each={projects()}>
                        {(_, i) => {
                          const mod = getModule(i(), registryMod.id);
                          return (
                            <td class="ui-pad-sm text-xs">
                              {mod ? new Date(mod.installedAt).toLocaleDateString() : (
                                <span class="text-neutral">—</span>
                              )}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                    <tr class="border-base-300 border-b">
                      <td class={rowHeaderClass(registryMod.id, (m) => m.lastRunGitRef)}>
                        {t3({ en: "Last run SHA", fr: "SHA dernière exécution" })}
                      </td>
                      <For each={projects()}>
                        {(_, i) => {
                          const mod = getModule(i(), registryMod.id);
                          return (
                            <td class={rowCellClass(registryMod.id, (m) => m.lastRunGitRef, "ui-pad-sm font-mono text-xs")}>
                              {mod?.lastRunGitRef?.slice(0, 7) ?? (
                                <span class="text-neutral">—</span>
                              )}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                    <tr class="border-base-300 border-b">
                      <td class="text-neutral ui-pad-sm sticky left-0 bg-base-100 pl-6 text-xs">
                        {t3({ en: "Last run at", fr: "Dernière exécution le" })}
                      </td>
                      <For each={projects()}>
                        {(_, i) => {
                          const mod = getModule(i(), registryMod.id);
                          return (
                            <td class="ui-pad-sm text-xs">
                              {mod?.lastRunAt ? new Date(mod.lastRunAt).toLocaleDateString() : (
                                <span class="text-neutral">—</span>
                              )}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                    <For each={params}>
                      {(param) => (
                        <tr class="border-base-300 border-b">
                          <td class={rowHeaderClass(registryMod.id, (m) => m.parameters.find((pa) => pa.replacementString === param.replacementString)?.value)}>
                            {param.description}
                          </td>
                          <For each={projects()}>
                            {(_, i) => {
                              const mod = getModule(i(), registryMod.id);
                              const value = mod?.parameters.find(
                                (pa) =>
                                  pa.replacementString ===
                                  param.replacementString,
                              )?.value;
                              const getParamValue = (m: CompareProjectsModule) => m.parameters.find((pa) => pa.replacementString === param.replacementString)?.value;
                              return (
                                <td class={rowCellClass(registryMod.id, getParamValue, "ui-pad-sm text-xs")}>
                                  {value ?? <span class="text-neutral">—</span>}
                                </td>
                              );
                            }}
                          </For>
                        </tr>
                      )}
                    </For>
                  </Show>
                </>
              );
            }}
          </For>
        </tbody>
      </table>
    </div>
  );
}
