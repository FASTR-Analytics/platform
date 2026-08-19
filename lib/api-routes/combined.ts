import { assetRouteRegistry } from "./instance/assets.ts";
import { geojsonMapRouteRegistry } from "./instance/geojson_maps.ts";
import { datasetRouteRegistry } from "./instance/datasets.ts";
import { dhis2CredentialsRouteRegistry } from "./instance/dhis2_credentials.ts";
import { emailRouteRegistry } from "./instance/emails.ts";
import { hfaIndicatorRouteRegistry } from "./instance/hfa_indicators.ts";
import { hfaTimePointRouteRegistry } from "./instance/hfa_time_points.ts";
import { icehRouteRegistry } from "./instance/iceh.ts";
import { indicatorRouteRegistry } from "./instance/indicators.ts";
import { calculatedIndicatorRouteRegistry } from "./instance/calculated_indicators.ts";
import { indicatorsDhis2RouteRegistry } from "./instance/indicators_dhis2.ts";
import { instanceRouteRegistry } from "./instance/instance.ts";
import { runGenerationRouteRegistry } from "./instance/run_generation.ts";
import { structureRouteRegistry } from "./instance/structure.ts";
import { userRouteRegistry } from "./instance/users.ts";
import { customPromptRouteRegistry } from "./instance/custom_prompts.ts";
import { whatsNewRouteRegistry } from "./instance/whats_new.ts";
import { onboardingRouteRegistry } from "./instance/onboarding.ts";
import { folderRouteRegistry } from "./products/folders.ts";
import { productRouteRegistry } from "./products/products.ts";
import { reportRouteRegistry } from "./products/reports.ts";
import { slideDeckRouteRegistry } from "./products/slide-decks.ts";
import { slideRouteRegistry } from "./products/slides.ts";

// Total individual route count across all feature registries.
// Used by validateAllRoutesDefined to detect key collisions (a collision causes
// the merged count to be less than the individual sum).
export const routeRegistryIndividualCount =
  Object.keys(assetRouteRegistry).length +
  Object.keys(geojsonMapRouteRegistry).length +
  Object.keys(datasetRouteRegistry).length +
  Object.keys(dhis2CredentialsRouteRegistry).length +
  Object.keys(emailRouteRegistry).length +
  Object.keys(hfaIndicatorRouteRegistry).length +
  Object.keys(hfaTimePointRouteRegistry).length +
  Object.keys(icehRouteRegistry).length +
  Object.keys(indicatorRouteRegistry).length +
  Object.keys(calculatedIndicatorRouteRegistry).length +
  Object.keys(indicatorsDhis2RouteRegistry).length +
  Object.keys(instanceRouteRegistry).length +
  Object.keys(runGenerationRouteRegistry).length +
  Object.keys(structureRouteRegistry).length +
  Object.keys(userRouteRegistry).length +
  Object.keys(customPromptRouteRegistry).length +
  Object.keys(whatsNewRouteRegistry).length +
  Object.keys(onboardingRouteRegistry).length +
  Object.keys(folderRouteRegistry).length +
  Object.keys(productRouteRegistry).length +
  Object.keys(reportRouteRegistry).length +
  Object.keys(slideDeckRouteRegistry).length +
  Object.keys(slideRouteRegistry).length;

// Combined route registry
export const routeRegistry = {
  ...assetRouteRegistry,
  ...geojsonMapRouteRegistry,
  ...datasetRouteRegistry,
  ...dhis2CredentialsRouteRegistry,
  ...emailRouteRegistry,
  ...hfaIndicatorRouteRegistry,
  ...hfaTimePointRouteRegistry,
  ...icehRouteRegistry,
  ...indicatorRouteRegistry,
  ...calculatedIndicatorRouteRegistry,
  ...indicatorsDhis2RouteRegistry,
  ...instanceRouteRegistry,
  ...runGenerationRouteRegistry,
  ...structureRouteRegistry,
  ...userRouteRegistry,
  ...customPromptRouteRegistry,
  ...whatsNewRouteRegistry,
  ...onboardingRouteRegistry,
  ...folderRouteRegistry,
  ...productRouteRegistry,
  ...reportRouteRegistry,
  ...slideDeckRouteRegistry,
  ...slideRouteRegistry,
} as const;
