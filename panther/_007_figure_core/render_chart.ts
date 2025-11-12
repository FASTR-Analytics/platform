// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "./deps.ts";
import { addSurrounds } from "./_surrounds/add_surrounds.ts";
import type { MeasuredPaneBase, MeasuredSurrounds } from "./measure_types.ts";
import { renderPane } from "./render_pane.ts";
import type {
  ChartRenderConfigBase,
  PaneRenderConfig,
} from "./render_types.ts";
import type { XPeriodAxisMeasuredInfo } from "./_axes/x_period/types.ts";
import type { XTextAxisMeasuredInfo } from "./_axes/x_text/types.ts";

// Main function that renders chart with surrounds
export function renderChart<
  TMeasured extends {
    measuredSurrounds: MeasuredSurrounds;
    mPanes: MeasuredPaneBase[];
  },
>(
  rc: RenderContext,
  measured: TMeasured,
  baseConfig: ChartRenderConfigBase,
) {
  addSurrounds(rc, measured.measuredSurrounds);

  for (let i_pane = 0; i_pane < measured.mPanes.length; i_pane++) {
    const mPane = measured.mPanes[i_pane];

    // Build pane-specific config with this pane's xAxisMeasuredInfo
    const paneConfig: PaneRenderConfig = {
      ...baseConfig,
      xAxisInfo: mPane.xAxisMeasuredInfo,
      xAxisRenderData: baseConfig.xAxisRenderDataBase.type === "text"
        ? {
          ...baseConfig.xAxisRenderDataBase,
          mx: mPane.xAxisMeasuredInfo as XTextAxisMeasuredInfo,
        }
        : baseConfig.xAxisRenderDataBase.type === "period"
        ? {
          ...baseConfig.xAxisRenderDataBase,
          mx: mPane.xAxisMeasuredInfo as XPeriodAxisMeasuredInfo,
        }
        : baseConfig.xAxisRenderDataBase,
    };

    renderPane(rc, mPane, i_pane, measured, paneConfig);
  }
}
