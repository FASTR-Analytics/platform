Context
The WB FASTR client has ~130 component files. Every page manually composes panther's low-level primitives (FrameTop, FrameLeft, HeadingBar, etc.) from scratch. The compositions are implicit - they exist as repeated JSX structures rather than named abstractions.
Goal: Define a page architecture vocabulary - a set of higher-level layout components that codify the app's 5 recurring page archetypes. All new components will live in client/src/components/layouts/ initially, with potential promotion to panther later.
What this is NOT: Extracting small repeated CSS snippets. This is about making page structures first-class, so new pages start from a named archetype rather than copying JSX.
The Five Page Archetypes
# ArchetypeCurrent CompositionInstancesProposed Component1Sub-pageEditorWrapper? + FrameTop + HeadingBar/HeadingBarMainRibbon~15SubPage2Project navigatorProvider + 2x StateHolderWrapper + dark bar + sidebar1 (core)ProjectShell3EditorEditorWrapper + FrameTop(toolbar) + multi-panel2(keep custom)4WizardFrameTop + HeaderBarCanGoBack + Stepper + StateHolderWrapper3-4WizardPage5Instance shellFrameTop(branded header + responsive ButtonGroup)1(keep custom)
Editor pages (#3) and the instance shell (#5) are too unique for meaningful abstraction. They should stay custom.

Component Designs

1. SidebarNav
Problem: project/index.tsx lines 152-217 contain 65 lines of identical JSX repeated 6 times. Each nav item is 8 lines with only icon, label, and tab key changing.
tsx// client/src/components/layouts/SidebarNav.tsx

import { Component, For, JSX, Show } from "solid-js";

type NavItem<T extends string> = {
  key: T;
  icon: Component;
  label: string;
  show?: boolean;  // defaults true
};

type SidebarNavProps<T extends string> = {
  items: NavItem<T>[];
  selected: T;
  onSelect: (key: T) => void;
};

export function SidebarNav<T extends string>(p: SidebarNavProps<T>) {
  return (
    <div class="font-700 h-full border-r text-sm">
      <For each={p.items}>
        {(item) => (
          <Show when={item.show !== false}>
            <div
              class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
              data-selected={p.selected === item.key}
              onClick={() => p.onSelect(item.key)}
            >
              <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                <item.icon />
              </span>
              {item.label}
            </div>
          </Show>
        )}
      </For>
    </div>
  );
}
Usage (replaces 65 lines in project/index.tsx):
tsx<FrameLeft panelChildren={
  <SidebarNav
    items={[
      { key: "chatbot", icon: SparklesIcon, label: t2("AI Assistant") },
      { key: "reports", icon: ReportIcon, label: t2(T.FRENCH_UI_STRINGS.reports) },
      { key: "visualizations", icon: ChartIcon, label: t2(T.FRENCH_UI_STRINGS.visualizations) },
      { key: "modules", icon: CodeIcon, label: t2(T.FRENCH_UI_STRINGS.modules) },
      { key: "data", icon: DatabaseIcon, label: t2(T.FRENCH_UI_STRINGS.data) },
      { key: "settings", icon: SettingsIcon, label: t2(T.FRENCH_UI_STRINGS.settings), show: p.isGlobalAdmin },
    ]}
    selected={tab()}
    onSelect={changeTab}
  />
}>

1. DetailBar
Problem: The dark top bar with back button + title + status/actions is manually built in project/index.tsx and report/index.tsx with subtly different styling.
tsx// client/src/components/layouts/DetailBar.tsx

import { JSX, Show } from "solid-js";
import { Button } from "panther";

type DetailBarProps = {
  title: string;
  back: () => void;
  variant?: "dark" | "light";
  children?: JSX.Element;  // right-side actions
};

export function DetailBar(p: DetailBarProps) {
  const isDark = () => (p.variant ?? "dark") === "dark";
  return (
    <div
      class="ui-gap ui-pad flex h-full w-full items-center"
      classList={{
        "bg-base-content text-base-100": isDark(),
        "bg-base-100 text-base-content border-b": !isDark(),
      }}
    >
      <Button iconName="chevronLeft" onClick={p.back} />
      <div class="font-700 flex-1 truncate text-xl">
        <span class="font-400">{p.title}</span>
      </div>
      <Show when={p.children}>
        <div class="ui-gap-sm flex items-center">
          {p.children}
        </div>
      </Show>
    </div>
  );
}
Usage (replaces 14 lines in project/index.tsx):
tsx<FrameTop panelChildren={
  <DetailBar title={projectName} back={() => navigate("/")} variant="dark">
    <ProjectRunStatus />
  </DetailBar>
}>

1. CardGrid
Problem: The responsive auto-fill grid with empty state is a 6-line incantation (ui-pad ui-gap grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start overflow-auto) repeated in instance_projects, project_reports, and other browse pages.
tsx// client/src/components/layouts/CardGrid.tsx

import { For, JSX, Show } from "solid-js";

type CardGridProps<T> = {
  items: T[];
  emptyMessage?: string;
  minItemWidth?: string;
  children: (item: T, index: () => number) => JSX.Element;
};

export function CardGrid<T>(p: CardGridProps<T>) {
  const minWidth = () => p.minItemWidth ?? "15rem";
  return (
    <div
      class="ui-gap ui-pad grid h-full w-full content-start overflow-auto"
      style={{ "grid-template-columns": `repeat(auto-fill, minmax(${minWidth()}, 1fr))` }}
    >
      <Show when={p.items.length > 0} fallback={
        <Show when={p.emptyMessage}>
          <div class="text-neutral text-sm">{p.emptyMessage}</div>
        </Show>
      }>
        <For each={p.items}>{p.children}</For>
      </Show>
    </div>
  );
}

1. SubPage
Problem: ~15 pages follow this exact pattern:
tsx<EditorWrapper?>
  <FrameTop panelChildren={
    <HeadingBar/HeadingBarMainRibbon heading={...} searchText={...} setSearchText={...} french={...}>
      {action buttons}
    </HeadingBar/HeadingBarMainRibbon>
  }>
    {content}
  </FrameTop>

</EditorWrapper?>
tsx// client/src/components/layouts/SubPage.tsx

import { JSX, Accessor, Setter, Show } from "solid-js";
import { FrameTop, HeadingBar, HeadingBarMainRibbon, getEditorWrapper } from "panther";
import { isFrench } from "lib";

type SubPageProps = {
  heading: string;
  search?: { text: Accessor<string>; setText: Setter<string> };
  variant?: "standard" | "ribbon";  // standard=HeadingBar (project-level), ribbon=HeadingBarMainRibbon (instance-level)
  actions?: JSX.Element;
  children: JSX.Element;
};

export function SubPage(p: SubPageProps) {
  const isRibbon = () => p.variant === "ribbon";

  const headingBar = () => {
    if (isRibbon()) {
      return (
        <HeadingBarMainRibbon heading={p.heading}>
          {p.actions}
        </HeadingBarMainRibbon>
      );
    }
    return (
      <HeadingBar
        heading={p.heading}
        searchText={p.search?.text()}
        setSearchText={p.search?.setText}
        french={isFrench()}
      >
        {p.actions}
      </HeadingBar>
    );
  };

  return (
    <FrameTop panelChildren={headingBar()}>
      {p.children}
    </FrameTop>
  );
}
Usage (replaces ~20 lines in each of 15 files):
tsx// project_visualizations.tsx
<SubPage
  heading={t2(T.FRENCH_UI_STRINGS.visualizations)}
  search={{ text: searchText, setText: setSearchText }}
  actions={
    <Show when={canCreate}>
      <Button onClick={create} iconName="plus">{t2(T.FRENCH_UI_STRINGS.create_visualization)}</Button>
    </Show>
  }
>
  <PresentationObjectPanelDisplay ... />
</SubPage>

// instance_projects.tsx
<SubPage heading={t2(T.FRENCH_UI_STRINGS.projects)} variant="ribbon"
  actions={<Button onClick={add} iconName="plus">{t2(T.FRENCH_UI_STRINGS.create_project)}</Button>}>
  <CardGrid items={projects} emptyMessage={t("No projects")}>
    {(project) => <ProjectCard project={project} />}
  </CardGrid>
</SubPage>
Note: EditorWrapper is NOT baked into SubPage. Pages that need editor overlays continue to wrap externally - this is intentional because editor state should be managed at the page level, not the layout level.

1. ProjectShell
Problem: project/index.tsx is 300 lines, but ~220 of them are structural boilerplate: ProjectRunnerProvider wrapping, timQuery for project detail, double StateHolderWrapper nesting, getEditorWrapper(), dark FrameTop, manual sidebar, and sub-page routing for searchParams.r/searchParams.v.
tsx// client/src/components/layouts/ProjectShell.tsx

import { Component, JSX, Accessor } from "solid-js";
import { ProjectDetail, InstanceDetail } from "lib";
import { TimQuery, OpenEditorProps } from "panther";

type ProjectShellTab<T extends string> = {
  key: T;
  icon: Component;
  label: string;
  show?: boolean;
};

type ProjectShellContext = {
  projectDetail: ProjectDetail;
  instanceDetail: InstanceDetail;
  silentRefreshProject: () => Promise<void>;
  fetchProjectDetail: () => Promise<void>;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>
  ) => Promise<TReturn | undefined>;
};

type ProjectShellProps<T extends string> = {
  projectId: string;
  instanceDetail: TimQuery<InstanceDetail>;
  isGlobalAdmin: boolean;
  tabs: ProjectShellTab<T>[];
  activeTab: Accessor<T>;
  onTabChange: (tab: T) => void;
  topBarRight?: JSX.Element;
  children: (ctx: ProjectShellContext) => JSX.Element;
};
Internally handles:

ProjectRunnerProvider wrapping
timQuery for project detail with silentFetch on dirty state changes
Double StateHolderWrapper (instance + project)
getEditorWrapper() + EditorWrapper
FrameTop with DetailBar (dark variant, project name, back navigation)
FrameLeft with SidebarNav from the tabs prop
The searchParams.r / searchParams.v routing for Report/Visualization sub-navigation

Usage (project/index.tsx drops from ~300 to ~80 lines):
tsxexport default function Project(p: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = createSignal<TabOption>("visualizations");

  function changeTab(tab: TabOption) {
    setSearchParams({ b: undefined, d: undefined });
    setTab(tab);
  }

  return (
    <ProjectShell
      projectId={p.projectId}
      instanceDetail={p.instanceDetail}
      isGlobalAdmin={p.isGlobalAdmin}
      tabs={[
        { key: "chatbot", icon: SparklesIcon, label: t2("AI Assistant") },
        { key: "reports", icon: ReportIcon, label: t2(T.FRENCH_UI_STRINGS.reports) },
        { key: "visualizations", icon: ChartIcon, label: t2(T.FRENCH_UI_STRINGS.visualizations) },
        { key: "modules", icon: CodeIcon, label: t2(T.FRENCH_UI_STRINGS.modules) },
        { key: "data", icon: DatabaseIcon, label: t2(T.FRENCH_UI_STRINGS.data) },
        { key: "settings", icon: SettingsIcon, label: t2(T.FRENCH_UI_STRINGS.settings), show: p.isGlobalAdmin },
      ]}
      activeTab={tab}
      onTabChange={changeTab}
      topBarRight={<ProjectRunStatus />}
    >
      {(ctx) => (
        <Switch>
          <Match when={tab() === "chatbot"}>
            <ProjectChatbot projectDetail={ctx.projectDetail}
              silentRefreshProject={ctx.silentRefreshProject}
              openProjectEditor={ctx.openProjectEditor} />
          </Match>
          <Match when={tab() === "visualizations"}>
            <ProjectVisualizations projectDetail={ctx.projectDetail}
              isGlobalAdmin={p.isGlobalAdmin}
              silentRefreshProject={ctx.silentRefreshProject}
              openProjectEditor={ctx.openProjectEditor} />
          </Match>
          {/*... other tabs ...*/}
        </Switch>
      )}
    </ProjectShell>
  );
}

1. WizardPage
Problem: The 3-4 wizard/import pages all share identical structure: FrameTop + HeaderBarCanGoBack + StepperNavigationVisual + StateHolderWrapper. Each manually nests these with ~25 lines of boilerplate.
tsx// client/src/components/layouts/WizardPage.tsx

import { JSX, Accessor } from "solid-js";
import { FrameTop, HeaderBarCanGoBack, StepperNavigationVisual, StateHolderWrapper, StateHolder, getStepper } from "panther";

type WizardPageProps<T> = {
  heading: string;
  onBack: () => void;
  stepper: ReturnType<typeof getStepper>;
  stepLabelFormatter?: (step: number) => string;
  headerActions?: JSX.Element;
  queryState: Accessor<StateHolder<T>>;
  onErrorButton?: { label: string; onClick: () => void };
  children: (data: T) => JSX.Element;
};

export function WizardPage<T>(p: WizardPageProps<T>) {
  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack heading={p.heading} back={p.onBack}>
          <div class="ui-gap-sm flex flex-none items-center">
            <StepperNavigationVisual
              stepper={p.stepper}
              stepLabelFormatter={p.stepLabelFormatter ?? ((step) => `${step + 1}`)}
            />
            {p.headerActions}
          </div>
        </HeaderBarCanGoBack>
      }
    >
      <StateHolderWrapper state={p.queryState()} onErrorButton={p.onErrorButton}>
        {(data) => p.children(data)}
      </StateHolderWrapper>
    </FrameTop>
  );
}

```

---

## Summary: New File Layout
```

client/src/components/layouts/
├── SidebarNav.tsx      # Declarative sidebar navigation
├── DetailBar.tsx       # Back button + title + actions bar
├── CardGrid.tsx        # Responsive card grid with empty state
├── SubPage.tsx         # FrameTop + HeadingBar wrapper (15+ uses)
├── ProjectShell.tsx    # Full project navigation skeleton (1 use but 220 LOC saved)
└── WizardPage.tsx      # Wizard/import page structure (3-4 uses)
Migration Impact
ComponentFiles AffectedLines Saved (approx)SidebarNav1 (project/index.tsx)55DetailBar2-3 (project/index, report/index, viz/index)30CardGrid3-4 (browse pages with card grids)15SubPage~15 (all sub-pages)150-200 totalProjectShell1 (project/index.tsx)~220WizardPage3-4 (import pages)75Total~22 files~550 lines
Panther Promotion Path
Once proven in the app, these are candidates for promotion to panther:

Strong candidates: SidebarNav, DetailBar, CardGrid (fully generic, no app dependencies)
Possible candidates: SubPage (if HeadingBar variants are generalized)
Stay in app: ProjectShell, WizardPage (too app-specific)

Verification Plan

cd client && npm run dev - start dev server
Navigate all instance tabs: Projects, Data, Assets, Users, Settings
Open a project - verify sidebar nav, all tabs
Open a visualization editor - verify toolbar
Open a report editor - verify toolbar and sidebar
Start a structure import - verify wizard flow
deno task typecheck - verify TypeScript
