import {
 MODULE_REGISTRY,
 t3,
 TC,
 type CompareProjectsData,
 type CompareProjectsModule,
} from"lib";
import {
 Button,
 EditorComponentProps,
 FrameTop,
 HeadingBar,
 StateHolderWrapper,
 createQuery,
} from"panther";
import { For, Show } from"solid-js";
import { serverActions } from"~/server_actions";

export function CompareProjects(p: EditorComponentProps<{}, undefined>) {
 const comparisonData = createQuery(
    () => serverActions.compareProjects({}),
 t3({
 en:"Loading comparison data...",
 fr:"Chargement des données de comparaison...",
 pt:"A carregar dados de comparação...",
    }),
  );

 return (
    <FrameTop
 panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft"onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en:"Compare projects", fr:"Comparer les projets", pt:"Comparar projetos"})}
          </div>
          <div class="ui-gap-sm flex items-center">
            {/* <Button iconName="refresh"onClick={datasetDetail.fetch} /> */}
          </div>
        </div>
      }
    >
      <StateHolderWrapper state={comparisonData.state()}>
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

 function isInconsistent(
 moduleId: string,
 getValue: (mod: CompareProjectsModule) => string | undefined,
  ): boolean {
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

 function rowHeaderClass(
 moduleId: string,
 getValue: (mod: CompareProjectsModule) => string | undefined,
  ): string {
 const danger = isInconsistent(moduleId, getValue);
 return danger
      ?"text-danger-subtle-content bg-danger-subtle ui-pad-sm sticky left-0 pl-6 text-xs"
      :"ui-text-caption ui-pad-sm sticky left-0 bg-base-100 pl-6";
  }

 function rowCellClass(
 moduleId: string,
 getValue: (mod: CompareProjectsModule) => string | undefined,
 base: string,
  ): string {
 return isInconsistent(moduleId, getValue) ?`${base} bg-danger-subtle`: base;
  }

 function dirtyBadge(dirty: string) {
 const cls =
 dirty ==="ready"
        ?"bg-success-subtle text-success-subtle-content"
        : dirty ==="error"
          ?"bg-danger-subtle text-danger-subtle-content"
          :"bg-warning-subtle text-warning-subtle-content";
 return (
      <span class={`rounded px-1.5 py-0.5 text-xs ${cls}`}>
        {dirty}
      </span>
    );
  }

 return (
    <div class="ui-pad">
      <table class="w-full border-collapse border text-sm">
        <thead>
          <tr class="border-b">
            <th class="text-base-content-muted ui-pad-sm bg-base-100 sticky left-0 text-left"></th>
            <For each={projects()}>
              {(project) => (
                <th class="ui-pad-sm text-left whitespace-nowrap">
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
                  <tr class="bg-base-200 border-b">
                    <td class="ui-pad-sm font-700 bg-base-200 sticky left-0">
                      {t3(registryMod.label)}
                    </td>
                    <For each={projects()}>
                      {(_, i) => {
 const mod = getModule(i(), registryMod.id);
 return (
                          <td class="ui-pad-sm">
                            <Show
 when={mod}
 fallback={<span class="text-base-content-muted">—</span>}
                            >
                              {dirtyBadge(mod!.dirty)}
                            </Show>
                          </td>
                        );
                      }}
                    </For>
                  </tr>
                  <Show when={anyInstalled}>
                    <tr class="border-b">
                      <td
 class={rowHeaderClass(
 registryMod.id,
                          (m) => m.computeDefGitRef,
                        )}
                      >
                        {t3({ en:"Compute SHA", fr:"SHA calcul", pt:"SHA de cálculo"})}
                      </td>
                      <For each={projects()}>
                        {(_, i) => {
 const mod = getModule(i(), registryMod.id);
 return (
                            <td
 class={rowCellClass(
 registryMod.id,
                                (m) => m.computeDefGitRef,
"ui-pad-sm font-mono text-xs",
                              )}
                            >
                              {mod?.computeDefGitRef?.slice(0, 7) ?? (
                                <span class="text-base-content-muted">—</span>
                              )}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                    <tr class="border-b">
                      <td
 class={rowHeaderClass(
 registryMod.id,
                          (m) => m.presentationDefGitRef,
                        )}
                      >
                        {t3({ en:"Presentation SHA", fr:"SHA présentation", pt:"SHA de apresentação"})}
                      </td>
                      <For each={projects()}>
                        {(_, i) => {
 const mod = getModule(i(), registryMod.id);
 return (
                            <td
 class={rowCellClass(
 registryMod.id,
                                (m) => m.presentationDefGitRef,
"ui-pad-sm font-mono text-xs",
                              )}
                            >
                              {mod?.presentationDefGitRef?.slice(0, 7) ?? (
                                <span class="text-base-content-muted">—</span>
                              )}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                    <tr class="border-b">
                      <td class="ui-text-caption ui-pad-sm bg-base-100 sticky left-0 pl-6">
                        {t3({
 en:"Presentation updated",
 fr:"Présentation mise à jour",
 pt:"Apresentação atualizada",
                        })}
                      </td>
                      <For each={projects()}>
                        {(_, i) => {
 const mod = getModule(i(), registryMod.id);
 return (
                            <td class="ui-pad-sm text-xs">
                              {mod?.presentationDefUpdatedAt ? (
 new Date(
 mod.presentationDefUpdatedAt,
                                ).toLocaleDateString()
                              ) : (
                                <span class="text-base-content-muted">—</span>
                              )}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                    <tr class="border-b">
                      <td
 class={rowHeaderClass(
 registryMod.id,
                          (m) => m.lastRunGitRef,
                        )}
                      >
                        {t3({
 en:"Last run SHA",
 fr:"SHA dernière exécution",
 pt:"SHA da última execução",
                        })}
                      </td>
                      <For each={projects()}>
                        {(_, i) => {
 const mod = getModule(i(), registryMod.id);
 return (
                            <td
 class={rowCellClass(
 registryMod.id,
                                (m) => m.lastRunGitRef,
"ui-pad-sm font-mono text-xs",
                              )}
                            >
                              {mod?.lastRunGitRef?.slice(0, 7) ?? (
                                <span class="text-base-content-muted">—</span>
                              )}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                    <tr class="border-b">
                      <td class="ui-text-caption ui-pad-sm bg-base-100 sticky left-0 pl-6">
                        {t3({ en:"Last run at", fr:"Dernière exécution le", pt:"Última execução em"})}
                      </td>
                      <For each={projects()}>
                        {(_, i) => {
 const mod = getModule(i(), registryMod.id);
 return (
                            <td class="ui-pad-sm text-xs">
                              {mod?.lastRunAt ? (
 new Date(mod.lastRunAt).toLocaleDateString()
                              ) : (
                                <span class="text-base-content-muted">—</span>
                              )}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                    <For each={params}>
                      {(param) => (
                        <tr class="border-b">
                          <td
 class={rowHeaderClass(
 registryMod.id,
                              (m) =>
 m.parameters.find(
                                  (pa) =>
 pa.replacementString ===
 param.replacementString,
                                )?.value,
                            )}
                          >
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
 const getParamValue = (
 m: CompareProjectsModule,
                              ) =>
 m.parameters.find(
                                  (pa) =>
 pa.replacementString ===
 param.replacementString,
                                )?.value;
 return (
                                <td
 class={rowCellClass(
 registryMod.id,
 getParamValue,
"ui-pad-sm text-xs",
                                  )}
                                >
                                  {value ?? <span class="text-base-content-muted">—</span>}
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
