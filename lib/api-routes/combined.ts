import { assetRouteRegistry } from "./instance/assets.ts";
import { backupRouteRegistry } from "./instance/backups.ts";
import { datasetRouteRegistry } from "./instance/datasets.ts";
import { indicatorRouteRegistry } from "./instance/indicators.ts";
import { indicatorsDhis2RouteRegistry } from "./instance/indicators_dhis2.ts";
import { instanceRouteRegistry } from "./instance/instance.ts";
import { structureRouteRegistry } from "./instance/structure.ts";
import { userRouteRegistry } from "./instance/users.ts";
import { aiToolsRouteRegistry } from "./project/ai-tools.ts";
import { moduleRouteRegistry } from "./project/modules.ts";
import { presentationObjectRouteRegistry } from "./project/presentation-objects.ts";
import { projectRouteRegistry } from "./project/projects.ts";
import { reportRouteRegistry } from "./project/reports.ts";
import { slideDeckRouteRegistry } from "./project/slide-decks.ts";
import { slideRouteRegistry } from "./project/slides.ts";
import { visualizationFolderRouteRegistry } from "./project/visualization-folders.ts";

// Combined route registry
export const routeRegistry = {
  ...assetRouteRegistry,
  ...backupRouteRegistry,
  ...datasetRouteRegistry,
  ...indicatorRouteRegistry,
  ...indicatorsDhis2RouteRegistry,
  ...instanceRouteRegistry,
  ...moduleRouteRegistry,
  ...structureRouteRegistry,
  ...userRouteRegistry,
  ...projectRouteRegistry,
  ...aiToolsRouteRegistry,
  ...presentationObjectRouteRegistry,
  ...reportRouteRegistry,
  ...slideDeckRouteRegistry,
  ...slideRouteRegistry,
  ...visualizationFolderRouteRegistry,
} as const;