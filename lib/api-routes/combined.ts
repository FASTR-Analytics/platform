import { assetRouteRegistry } from "./instance/assets.ts";
import { geojsonMapRouteRegistry } from "./instance/geojson_maps.ts";
import { backupRouteRegistry } from "./instance/backups.ts";
import { datasetRouteRegistry } from "./instance/datasets.ts";
import { dhis2CredentialsRouteRegistry } from "./instance/dhis2_credentials.ts";
import { hfaIndicatorRouteRegistry } from "./instance/hfa_indicators.ts";
import { hfaTimePointRouteRegistry } from "./instance/hfa_time_points.ts";
import { icehRouteRegistry } from "./instance/iceh.ts";
import { indicatorRouteRegistry } from "./instance/indicators.ts";
import { calculatedIndicatorRouteRegistry } from "./instance/calculated_indicators.ts";
import { indicatorsDhis2RouteRegistry } from "./instance/indicators_dhis2.ts";
import { instanceRouteRegistry } from "./instance/instance.ts";
import { instanceModuleRouteRegistry } from "./instance/modules.ts";
import { structureRouteRegistry } from "./instance/structure.ts";
import { userRouteRegistry } from "./instance/users.ts";
import { aiToolsRouteRegistry } from "./project/ai-tools.ts";
import { moduleRouteRegistry } from "./project/modules.ts";
import { presentationObjectRouteRegistry } from "./project/presentation-objects.ts";
import { projectRouteRegistry } from "./project/projects.ts";
import { slideDeckRouteRegistry } from "./project/slide-decks.ts";
import { slideDeckFolderRouteRegistry } from "./project/slide-deck-folders.ts";
import { reportRouteRegistry } from "./project/reports.ts";
import { reportFolderRouteRegistry } from "./project/report-folders.ts";
import { slideRouteRegistry } from "./project/slides.ts";
import { dashboardRouteRegistry } from "./project/dashboards.ts";
import { visualizationFolderRouteRegistry } from "./project/visualization-folders.ts";
import { emailRouteRegistry } from "./project/emails.ts";
import { cacheStatusRouteRegistry } from "./project/cache-status.ts";
import { customPromptRouteRegistry } from "./instance/custom_prompts.ts";

// Total individual route count across all feature registries.
// Used by validateAllRoutesDefined to detect key collisions (a collision causes
// the merged count to be less than the individual sum).
export const routeRegistryIndividualCount =
  Object.keys(assetRouteRegistry).length +
  Object.keys(geojsonMapRouteRegistry).length +
  Object.keys(backupRouteRegistry).length +
  Object.keys(datasetRouteRegistry).length +
  Object.keys(dhis2CredentialsRouteRegistry).length +
  Object.keys(hfaIndicatorRouteRegistry).length +
  Object.keys(hfaTimePointRouteRegistry).length +
  Object.keys(icehRouteRegistry).length +
  Object.keys(indicatorRouteRegistry).length +
  Object.keys(calculatedIndicatorRouteRegistry).length +
  Object.keys(indicatorsDhis2RouteRegistry).length +
  Object.keys(instanceRouteRegistry).length +
  Object.keys(instanceModuleRouteRegistry).length +
  Object.keys(moduleRouteRegistry).length +
  Object.keys(structureRouteRegistry).length +
  Object.keys(userRouteRegistry).length +
  Object.keys(projectRouteRegistry).length +
  Object.keys(aiToolsRouteRegistry).length +
  Object.keys(presentationObjectRouteRegistry).length +
  Object.keys(slideDeckRouteRegistry).length +
  Object.keys(slideDeckFolderRouteRegistry).length +
  Object.keys(reportRouteRegistry).length +
  Object.keys(reportFolderRouteRegistry).length +
  Object.keys(slideRouteRegistry).length +
  Object.keys(dashboardRouteRegistry).length +
  Object.keys(visualizationFolderRouteRegistry).length +
  Object.keys(emailRouteRegistry).length +
  Object.keys(cacheStatusRouteRegistry).length +
  Object.keys(customPromptRouteRegistry).length;

// Combined route registry
export const routeRegistry = {
  ...assetRouteRegistry,
  ...geojsonMapRouteRegistry,
  ...backupRouteRegistry,
  ...datasetRouteRegistry,
  ...dhis2CredentialsRouteRegistry,
  ...hfaIndicatorRouteRegistry,
  ...hfaTimePointRouteRegistry,
  ...icehRouteRegistry,
  ...indicatorRouteRegistry,
  ...calculatedIndicatorRouteRegistry,
  ...indicatorsDhis2RouteRegistry,
  ...instanceRouteRegistry,
  ...instanceModuleRouteRegistry,
  ...moduleRouteRegistry,
  ...structureRouteRegistry,
  ...userRouteRegistry,
  ...projectRouteRegistry,
  ...aiToolsRouteRegistry,
  ...presentationObjectRouteRegistry,
  ...slideDeckRouteRegistry,
  ...slideDeckFolderRouteRegistry,
  ...reportRouteRegistry,
  ...reportFolderRouteRegistry,
  ...slideRouteRegistry,
  ...dashboardRouteRegistry,
  ...visualizationFolderRouteRegistry,
  ...emailRouteRegistry,
  ...cacheStatusRouteRegistry,
  ...customPromptRouteRegistry,
} as const;
