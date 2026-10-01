import {
  type InstalledModuleSummary,
  type PackageScope,
  type RunAuthoringContext,
  type RunDetail,
  t3,
} from "lib";
import { type ListEntry, SelectList } from "panther";
import { createMemo, Show } from "solid-js";
import { ModulePane } from "./module_pane";
import type { OpenEditor } from "./visualizations";

// One family tab of a READY package: the family's modules as a list, the
// primary first and the supporting analyses under a header, beside the
// selected module's pane. `modules` arrives in module order (compareModules)
// and the selection is the page's, so it survives a tab switch and dies
// with the page.
export function FamilyPane(p: {
  runId: string;
  modules: InstalledModuleSummary[];
  selectedModuleId: string;
  onSelectModule: (moduleId: string) => void;
  detail: RunDetail;
  ctx: RunAuthoringContext;
  scope: PackageScope;
  onChangeScope: (scopeId: string | null) => void;
  openEditor: OpenEditor;
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
              onChangeScope={p.onChangeScope}
              openEditor={p.openEditor}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
