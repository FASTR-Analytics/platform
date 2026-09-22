import {
  t3,
  type DatasetType,
  type InstalledModuleSummary,
  type PackageScope,
  type RunAuthoringContext,
  type RunDetail,
} from "lib";
import { SelectList, getEditorWrapper, type ListEntry } from "panther";
import { Show, createMemo } from "solid-js";
import type { ScopeSelection } from "~/components/_shared/mod.ts";
import { ModulePane } from "./module_pane";

// One family tab of a READY package: the family's modules as a list, the
// primary first and the supporting analyses under a header, beside the
// selected module's pane. `modules` arrives in module order (compareModules)
// and the selection is the page's, so it survives a tab switch and dies
// with the page.
export function FamilyPane(p: {
  runId: string;
  family: DatasetType;
  modules: InstalledModuleSummary[];
  selectedModuleId: string;
  onSelectModule: (moduleId: string) => void;
  detail: RunDetail;
  ctx: RunAuthoringContext;
  scope: PackageScope;
  selection: ScopeSelection;
  onChangeScope: (s: ScopeSelection) => void;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  const items = createMemo((): ListEntry<string>[] => {
    const primary = p.modules.filter((m) => m.tier === "primary");
    const secondary = p.modules.filter((m) => m.tier === "secondary");
    const toItem = (m: InstalledModuleSummary) => ({
      id: m.id,
      label: m.label,
    });
    return [
      ...primary.map(toItem),
      ...(secondary.length > 0
        ? [
            {
              header: t3({
                en: "Supporting analyses",
                fr: "Analyses complémentaires",
                pt: "Análises complementares",
              }),
            },
            ...secondary.map(toItem),
          ]
        : []),
    ];
  });

  const selected = () => p.modules.find((m) => m.id === p.selectedModuleId);

  return (
    <div class="ui-gap flex items-start">
      <div class="w-64 flex-none">
        <SelectList
          items={items()}
          value={p.selectedModuleId}
          onChange={p.onSelectModule}
          fullWidth
        />
      </div>
      <div class="min-w-0 flex-1">
        <Show when={selected()} keyed>
          {(module) => (
            <ModulePane
              runId={p.runId}
              module={module}
              detailModule={p.detail.modules.find(
                (m) => m.moduleId === module.id,
              )}
              ctx={p.ctx}
              scope={p.scope}
              selection={p.selection}
              onChangeScope={p.onChangeScope}
              openEditor={p.openEditor}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
