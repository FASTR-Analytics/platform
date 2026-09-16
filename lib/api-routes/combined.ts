import { assetRouteRegistry } from "./instance/assets.ts";
import { geojsonMapRouteRegistry } from "./instance/geojson_maps.ts";
import { datasetRouteRegistry } from "./instance/datasets.ts";
import { dhis2CredentialsRouteRegistry } from "./instance/dhis2_credentials.ts";
import { hfaIndicatorRouteRegistry } from "./instance/hfa_indicators.ts";
import { hfaTimePointRouteRegistry } from "./instance/hfa_time_points.ts";
import { icehRouteRegistry } from "./instance/iceh.ts";
import { indicatorRouteRegistry } from "./instance/indicators.ts";
import { indicatorsDhis2RouteRegistry } from "./instance/indicators_dhis2.ts";
import { instanceRouteRegistry } from "./instance/instance.ts";
import { instanceModuleRouteRegistry } from "./instance/modules.ts";
import { populationRouteRegistry } from "./instance/population.ts";
import { runGenerationRouteRegistry } from "./instance/run_generation.ts";
import { structureRouteRegistry } from "./instance/structure.ts";
import { userRouteRegistry } from "./instance/users.ts";
import { emailRouteRegistry } from "./instance/emails.ts";
import { productRouteRegistry } from "./products/products.ts";
import { folderRouteRegistry } from "./products/folders.ts";
import { productSlideDeckRouteRegistry } from "./products/slide-decks.ts";
import { productSlideRouteRegistry } from "./products/slides.ts";
import { productReportRouteRegistry } from "./products/reports.ts";
import { customPromptRouteRegistry } from "./instance/custom_prompts.ts";
import { whatsNewRouteRegistry } from "./instance/whats_new.ts";
import { onboardingRouteRegistry } from "./instance/onboarding.ts";

// Total individual route count across all feature registries.
// Used by validateAllRoutesDefined to detect key collisions (a collision causes
// the merged count to be less than the individual sum).
export const routeRegistryIndividualCount =
  Object.keys(assetRouteRegistry).length +
  Object.keys(geojsonMapRouteRegistry).length +
  Object.keys(datasetRouteRegistry).length +
  Object.keys(dhis2CredentialsRouteRegistry).length +
  Object.keys(hfaIndicatorRouteRegistry).length +
  Object.keys(hfaTimePointRouteRegistry).length +
  Object.keys(icehRouteRegistry).length +
  Object.keys(indicatorRouteRegistry).length +
  Object.keys(indicatorsDhis2RouteRegistry).length +
  Object.keys(instanceRouteRegistry).length +
  Object.keys(instanceModuleRouteRegistry).length +
  Object.keys(populationRouteRegistry).length +
  Object.keys(runGenerationRouteRegistry).length +
  Object.keys(structureRouteRegistry).length +
  Object.keys(userRouteRegistry).length +
  Object.keys(emailRouteRegistry).length +
  Object.keys(productRouteRegistry).length +
  Object.keys(folderRouteRegistry).length +
  Object.keys(productSlideDeckRouteRegistry).length +
  Object.keys(productSlideRouteRegistry).length +
  Object.keys(productReportRouteRegistry).length +
  Object.keys(customPromptRouteRegistry).length +
  Object.keys(whatsNewRouteRegistry).length +
  Object.keys(onboardingRouteRegistry).length;

// Combined route registry
export const routeRegistry = {
  ...assetRouteRegistry,
  ...geojsonMapRouteRegistry,
  ...datasetRouteRegistry,
  ...dhis2CredentialsRouteRegistry,
  ...hfaIndicatorRouteRegistry,
  ...hfaTimePointRouteRegistry,
  ...icehRouteRegistry,
  ...indicatorRouteRegistry,
  ...indicatorsDhis2RouteRegistry,
  ...instanceRouteRegistry,
  ...instanceModuleRouteRegistry,
  ...populationRouteRegistry,
  ...runGenerationRouteRegistry,
  ...structureRouteRegistry,
  ...userRouteRegistry,
  ...emailRouteRegistry,
  ...productRouteRegistry,
  ...folderRouteRegistry,
  ...productSlideDeckRouteRegistry,
  ...productSlideRouteRegistry,
  ...productReportRouteRegistry,
  ...customPromptRouteRegistry,
  ...whatsNewRouteRegistry,
  ...onboardingRouteRegistry,
} as const;
