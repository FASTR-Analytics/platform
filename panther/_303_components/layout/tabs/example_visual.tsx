// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Match, Switch } from "solid-js";
import { getTabs, TabsNavigation } from "./mod.ts";
import { SelectOption } from "../../form_inputs/types.ts";
import { FrameLeft, FrameTop } from "../frames.tsx";

// Example showing different tab configurations
export function ExampleVisualTabs() {
  // Basic tabs example
  const basicTabOptions: SelectOption<string>[] = [
    { value: "overview", label: "Overview" },
    { value: "details", label: "Details" },
    { value: "settings", label: "Settings" },
  ];

  const basicTabs = getTabs(basicTabOptions, {
    initialTab: "overview",
  });

  // Tabs with JSX labels and badges
  const advancedTabOptions: SelectOption<string>[] = [
    { value: "inbox", label: "📥 Inbox" },
    { value: "sent", label: "📤 Sent" },
    { value: "drafts", label: "📝 Drafts" },
    { value: "spam", label: "🚫 Spam" },
  ];

  const advancedTabs = getTabs(advancedTabOptions, {
    initialTab: "inbox",
    onTabChange: (tab) => console.log(`Switched to ${tab}`),
  });

  // Dynamic tab badges
  const getBadgeCount = (tab: string) => {
    const counts: Record<string, number> = {
      inbox: 12,
      sent: 0,
      drafts: 3,
      spam: 99,
    };
    return counts[tab] || undefined;
  };

  // User tabs
  const userTabOptions: SelectOption<string>[] = [
    { value: "1", label: "Alice Johnson" },
    { value: "2", label: "Bob Smith" },
    { value: "3", label: "Carol White" },
  ];

  const userTabs = getTabs(userTabOptions, {
    initialTab: "1",
    onTabChange: (userId) => console.log(`Selected user: ${userId}`),
  });

  return (
    <div class="ui-spy">
      <div>
        <h3>Horizontal Tabs with FrameTop</h3>
        <div class="h-80 border border-base-300">
          <FrameTop
            panelChildren={<TabsNavigation tabs={basicTabs} />}
          >
            <div class="ui-pad h-full">
              <Switch>
                <Match when={basicTabs.isTabActive("overview")}>
                  <div>
                    <h4>Overview Panel</h4>
                    <p>
                      This is the overview content displayed in the main frame
                      area.
                    </p>
                    <p>
                      The tabs are in the top panel, and this content scrolls
                      independently.
                    </p>
                  </div>
                </Match>
                <Match when={basicTabs.isTabActive("details")}>
                  <div>
                    <h4>Details Panel</h4>
                    <p>
                      Here are the detailed information in the main content
                      area.
                    </p>
                    <p>
                      Notice how the tab bar stays fixed at the top while this
                      content can scroll.
                    </p>
                  </div>
                </Match>
                <Match when={basicTabs.isTabActive("settings")}>
                  <div>
                    <h4>Settings Panel</h4>
                    <p>Configure your settings here in the main frame.</p>
                    <p>
                      This demonstrates the typical tab + content layout
                      pattern.
                    </p>
                  </div>
                </Match>
              </Switch>
            </div>
          </FrameTop>
        </div>
        <p class="text-sm text-base-content">
          Current tab: {basicTabs.currentTab()}
        </p>
      </div>

      <div>
        <h3>Horizontal Tabs with Badges</h3>
        <TabsNavigation
          tabs={advancedTabs}
          showBadge={getBadgeCount}
        />
        <div class="ui-pad border border-t-0 border-base-300">
          <Switch>
            <Match when={advancedTabs.isTabActive("inbox")}>
              <div>You have 12 new messages!</div>
            </Match>
            <Match when={advancedTabs.isTabActive("sent")}>
              <div>Your sent messages appear here.</div>
            </Match>
            <Match when={advancedTabs.isTabActive("drafts")}>
              <div>3 draft messages saved.</div>
            </Match>
            <Match when={advancedTabs.isTabActive("spam")}>
              <div>99 spam messages (automatically filtered).</div>
            </Match>
          </Switch>
        </div>
      </div>

      <div>
        <h3>Vertical Tabs with FrameLeft</h3>
        <div class="h-80 border border-base-300">
          <FrameLeft
            panelChildren={<TabsNavigation tabs={userTabs} vertical={true} />}
          >
            <div class="ui-pad h-full">
              <Switch>
                <Match when={userTabs.isTabActive("1")}>
                  <div>
                    <h4>Alice Johnson</h4>
                    <p>Software Engineer</p>
                    <p>alice@example.com</p>
                    <p>
                      This content area scrolls independently of the left
                      sidebar tabs.
                    </p>
                  </div>
                </Match>
                <Match when={userTabs.isTabActive("2")}>
                  <div>
                    <h4>Bob Smith</h4>
                    <p>Product Manager</p>
                    <p>bob@example.com</p>
                    <p>
                      The vertical tabs stay fixed in the left panel while
                      content changes here.
                    </p>
                  </div>
                </Match>
                <Match when={userTabs.isTabActive("3")}>
                  <div>
                    <h4>Carol White</h4>
                    <p>Designer</p>
                    <p>carol@example.com</p>
                    <p>Perfect for sidebar navigation patterns.</p>
                  </div>
                </Match>
              </Switch>
            </div>
          </FrameLeft>
        </div>
        <p class="text-sm text-base-content">
          Selected user ID: {userTabs.currentTab()}
        </p>
      </div>

      <div>
        <h3>Custom Click Handler</h3>
        <TabsNavigation
          tabs={basicTabs}
          onTabClick={(tab) => {
            console.log(`Custom handler: Clicked ${tab}`);
            // You could add validation, analytics, etc. here
            basicTabs.setCurrentTab(() => tab);
          }}
        />
      </div>

      <div>
        <h3>Custom Label Formatter</h3>
        <TabsNavigation
          tabs={advancedTabs}
          tabLabelFormatter={(option) => typeof option.label === "string"
            ? option.label.replace(/[^\w\s]/g, "") // Remove emojis
            : String(option.value)}
          showBadge={getBadgeCount}
        />
      </div>
    </div>
  );
}
