import { AIToolFailure } from "panther";
import {
  type APIResponseWithData,
  type HfaDictionaryForValidation,
  type HfaIndicator,
  type HfaIndicatorCode,
  type HfaIndicatorsForAIInput,
  hfaIndicatorsStatus,
  type HfaIndicatorVariantCode,
  type HfaTaxonomyInput,
  type HfaVariableRow,
} from "lib";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import {
  getDatasetHfaDisplayInfoFromCacheOrFetch,
  getHfaDictionaryFromCacheOrFetch,
} from "~/state/instance/t2_datasets";
import { can } from "~/state/instance/permissions";

// The HFA state the copilot's HFA tools and Draft a fix read. The
// indicators, the taxonomy and the code are read fresh on every call, so a
// tool acts on current state, its own earlier writes included; the survey
// dictionary and the dataset display read through the T2 caches the manager
// uses, keyed on the instance's HFA cache hash. A failed read throws
// `AIToolFailure`, whose message is the whole record: the chat hands it to
// the model as the tool's error, and a fix shows it as why none was drafted.

export async function loadIndicators(): Promise<HfaIndicator[]> {
  const res = await serverActions.getHfaIndicators({});
  if (!res.success) {
    throw new AIToolFailure(`Could not load HFA indicators: ${res.err}`);
  }
  return res.data;
}

export async function loadTaxonomy(): Promise<HfaTaxonomyInput> {
  const [categories, subCategories, serviceCategories, groups, items] =
    await Promise.all([
      serverActions.getHfaIndicatorCategories({}),
      serverActions.getHfaIndicatorSubCategories({}),
      serverActions.getHfaIndicatorServiceCategories({}),
      serverActions.getHfaIndicatorVariantGroups({}),
      serverActions.getHfaIndicatorVariantItems({}),
    ]);
  const data = <T>(res: APIResponseWithData<T>): T => {
    if (!res.success) {
      throw new AIToolFailure(`Could not load the HFA taxonomy: ${res.err}`);
    }
    return res.data;
  };
  return {
    categories: data(categories),
    subCategories: data(subCategories),
    serviceCategories: data(serviceCategories),
    variantGroups: data(groups),
    variantItems: data(items),
  };
}

export async function loadDictionary(): Promise<HfaDictionaryForValidation> {
  const res = await getHfaDictionaryFromCacheOrFetch(
    instanceState.hfaCacheHash,
  );
  if (!res.success) {
    throw new AIToolFailure(
      `Could not load the HFA survey variable dictionary: ${res.err}`,
    );
  }
  return res.data;
}

export async function loadAllCode(): Promise<HfaIndicatorCode[]> {
  const res = await serverActions.getAllHfaIndicatorCode({});
  if (!res.success) {
    throw new AIToolFailure(`Could not load HFA indicator code: ${res.err}`);
  }
  return res.data;
}

export async function loadAllVariantCode(): Promise<HfaIndicatorVariantCode[]> {
  const res = await serverActions.getAllHfaIndicatorVariantCode({});
  if (!res.success) {
    throw new AIToolFailure(
      `Could not load HFA indicator variant code: ${res.err}`,
    );
  }
  return res.data;
}

// The display rows need `can_view_data`, which the reads do not: without it
// the formatters print one line saying the counts are left out.
export async function loadDisplayRows(): Promise<HfaVariableRow[] | undefined> {
  if (!can("can_view_data")) return undefined;
  const res = await getDatasetHfaDisplayInfoFromCacheOrFetch(
    instanceState.hfaCacheHash,
  );
  if (!res.success) {
    throw new AIToolFailure(
      `Could not load the HFA dataset's variable counts: ${res.err}`,
    );
  }
  return res.data.rows;
}

export async function loadReadInput(
  withDisplayRows: boolean,
): Promise<HfaIndicatorsForAIInput> {
  const [indicators, taxonomy, code, variantCode, dictionary, displayRows] =
    await Promise.all([
      loadIndicators(),
      loadTaxonomy(),
      loadAllCode(),
      loadAllVariantCode(),
      loadDictionary(),
      withDisplayRows ? loadDisplayRows() : Promise.resolve(undefined),
    ]);
  return {
    indicators,
    taxonomy,
    code,
    variantCode,
    dictionary,
    displayRows,
    status: hfaIndicatorsStatus({
      indicators,
      code,
      variantCode,
      variantItems: taxonomy.variantItems,
      dictionary,
    }),
  };
}
