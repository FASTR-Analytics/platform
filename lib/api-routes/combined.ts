import { assetRouteRegistry } from "./instance/assets.ts";
import { datasetRouteRegistry } from "./instance/datasets.ts";
import { indicatorRouteRegistry } from "./instance/indicators.ts";
import { indicatorsDhis2RouteRegistry } from "./instance/indicators_dhis2.ts";
import { instanceRouteRegistry } from "./instance/instance.ts";
import { structureRouteRegistry } from "./instance/structure.ts";
import { userRouteRegistry } from "./instance/users.ts";
import { aiInterpretationRouteRegistry } from "./project/ai-interpretation.ts";
import { moduleRouteRegistry } from "./project/modules.ts";
import { presentationObjectRouteRegistry } from "./project/presentation-objects.ts";
import { projectRouteRegistry } from "./project/projects.ts";
import { reportRouteRegistry } from "./project/reports.ts";

// Combined route registry
export const routeRegistry = {
  ...assetRouteRegistry,
  ...datasetRouteRegistry,
  ...indicatorRouteRegistry,
  ...indicatorsDhis2RouteRegistry,
  ...instanceRouteRegistry,
  ...moduleRouteRegistry,
  ...structureRouteRegistry,
  ...userRouteRegistry,
  ...projectRouteRegistry,
  ...aiInterpretationRouteRegistry,
  ...presentationObjectRouteRegistry,
  ...reportRouteRegistry,
} as const;