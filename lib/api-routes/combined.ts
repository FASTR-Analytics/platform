import { assetRouteRegistry } from "./instance/assets.ts";
import { geojsonMapRouteRegistry } from "./instance/geojson_maps.ts";
import { backupRouteRegistry } from "./instance/backups.ts";
import { datasetRouteRegistry } from "./instance/datasets.ts";
import { hfaIndicatorRouteRegistry } from "./instance/hfa_indicators.ts";
import { hfaTimePointRouteRegistry } from "./instance/hfa_time_points.ts";
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
import { slideRouteRegistry } from "./project/slides.ts";
import { visualizationFolderRouteRegistry } from "./project/visualization-folders.ts";
import { emailRouteRegistry } from "./project/emails.ts";
import { cacheStatusRouteRegistry } from "./project/cache-status.ts";

// Combined route registry
export const routeRegistry = {
  ...assetRouteRegistry,
  ...geojsonMapRouteRegistry,
  ...backupRouteRegistry,
  ...datasetRouteRegistry,
  ...hfaIndicatorRouteRegistry,
  ...hfaTimePointRouteRegistry,
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
  ...slideRouteRegistry,
  ...visualizationFolderRouteRegistry,
  ...emailRouteRegistry,
  ...cacheStatusRouteRegistry,
} as const;
