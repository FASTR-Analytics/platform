// Pins the data-set-side read of each element's data sets: the pure
// reduction of dataSets rows to links per asked element, the verdict and
// the monthly-set selector over reduced links, and, on a live DHIS2, that
// the links equal what the element side's own dataSetElements field names
// for a sample. The live tests run when DHIS2_TEST_URL, DHIS2_TEST_USERNAME
// and DHIS2_TEST_PASSWORD are set, for a user who can read every data set
// (the data-set side lists only the sets the user may read), and are
// ignored otherwise:
//
//   DHIS2_TEST_URL=https://play.im.dhis2.org/stable-2-40-12 \
//   DHIS2_TEST_USERNAME=admin DHIS2_TEST_PASSWORD=district \
//   deno test -A --env-file server/tests/dhis2_dataset_links_test.ts

import { assert, assertEquals } from "@std/assert";
import type { DHIS2DataElement, DHIS2DataSetLink } from "lib";
import { type FetchOptions, getDHIS2 } from "../dhis2/common/base_fetcher.ts";
import {
  getDhis2ElementVerdict,
  monthlyDataSetId,
} from "../dhis2/goal2_indicators/element_eligibility.ts";
import {
  dataSetLinksByElement,
  type DataSetWire,
  getDataSetLinksByElement,
} from "../dhis2/goal2_indicators/get_data_set_links_from_dhis2.ts";
import { getDataElementsFromDHIS2 } from "../dhis2/goal2_indicators/get_indicators_from_dhis2.ts";

const A = "ElemAaaaaa1";
const B = "ElemBbbbbb2";
const X = "ElemXxxxxx9";

function set(
  id: string,
  periodType: string | null | undefined,
  elementIds: string[],
): DataSetWire {
  return {
    id,
    periodType,
    dataSetElements: elementIds.map((e) => ({ dataElement: { id: e } })),
  };
}

function links(
  map: Map<string, DHIS2DataSetLink[]>,
): Record<string, DHIS2DataSetLink[]> {
  return Object.fromEntries(map);
}

Deno.test("links: each asked element gets its sets, an element in none gets no links", () => {
  assertEquals(
    links(dataSetLinksByElement([A, B], [
      set("DsM", "Monthly", [A]),
      set("DsQ", "Quarterly", [A]),
    ])),
    {
      [A]: [
        { id: "DsM", periodType: "Monthly" },
        { id: "DsQ", periodType: "Quarterly" },
      ],
      [B]: [],
    },
  );
  assertEquals(links(dataSetLinksByElement([A], [])), { [A]: [] });
});

Deno.test("links: an empty set links nothing", () => {
  assertEquals(
    links(dataSetLinksByElement([A], [set("DsM", "Monthly", [])])),
    { [A]: [] },
  );
});

Deno.test("links: a set answered twice, once per chunk, links once", () => {
  assertEquals(
    links(dataSetLinksByElement([A, B], [
      set("DsM", "Monthly", [A, B]),
      set("DsM", "Monthly", [A, B]),
    ])),
    {
      [A]: [{ id: "DsM", periodType: "Monthly" }],
      [B]: [{ id: "DsM", periodType: "Monthly" }],
    },
  );
});

Deno.test("links: an element the answer carries but nobody asked for is dropped", () => {
  assertEquals(
    links(dataSetLinksByElement([A], [set("DsM", "Monthly", [A, X])])),
    { [A]: [{ id: "DsM", periodType: "Monthly" }] },
  );
});

Deno.test("links: null wire fields are tolerated", () => {
  assertEquals(
    links(dataSetLinksByElement([A], [
      {
        id: null,
        periodType: "Monthly",
        dataSetElements: [{ dataElement: { id: A } }],
      },
      { id: "DsN", periodType: "Monthly", dataSetElements: null },
      {
        id: "DsO",
        periodType: "Monthly",
        dataSetElements: [null, { dataElement: null }, {
          dataElement: { id: null },
        }],
      },
      set("DsP", null, [A]),
      set("DsR", undefined, [A]),
    ])),
    {
      [A]: [
        { id: "DsP", periodType: undefined },
        { id: "DsR", periodType: undefined },
      ],
    },
  );
});

Deno.test("links: an element's sets are in data set id order, whatever the answer's", () => {
  assertEquals(
    links(dataSetLinksByElement([A], [
      set("DsZ", "Yearly", [A]),
      set("DsA", "Monthly", [A]),
      set("DsM", "Quarterly", [A]),
    ])),
    {
      [A]: [
        { id: "DsA", periodType: "Monthly" },
        { id: "DsM", periodType: "Quarterly" },
        { id: "DsZ", periodType: "Yearly" },
      ],
    },
  );
});

function element(dataSets: DHIS2DataSetLink[]): DHIS2DataElement {
  return {
    id: A,
    name: "ANC 1st visit",
    displayName: "ANC 1st visit",
    aggregationType: "SUM",
    valueType: "INTEGER_ZERO_OR_POSITIVE",
    dataSets,
  };
}

Deno.test("verdict over reduced links: monthly among several accepted, none refused, no set refused", () => {
  const reduced = dataSetLinksByElement([A, B, X], [
    set("DsQ", "Quarterly", [A, B]),
    set("DsM", "Monthly", [A]),
    set("DsY", "Yearly", [B]),
  ]);
  assertEquals(getDhis2ElementVerdict(element(reduced.get(A)!)), {
    accepted: true,
  });
  assertEquals(getDhis2ElementVerdict(element(reduced.get(B)!)), {
    accepted: false,
    refusal: { kind: "period_type", value: "Quarterly, Yearly" },
  });
  assertEquals(getDhis2ElementVerdict(element(reduced.get(X)!)), {
    accepted: false,
    refusal: { kind: "period_type", value: undefined },
  });
});

Deno.test("monthlyDataSetId over reduced links: the lowest monthly set id, whatever the answer's order", () => {
  const reduced = dataSetLinksByElement([A, B], [
    set("DsM2", "Monthly", [A]),
    set("DsM1", "Monthly", [A]),
    set("DsA0", "Quarterly", [A, B]),
  ]);
  assertEquals(monthlyDataSetId(reduced.get(A)!), "DsM1");
  assertEquals(monthlyDataSetId(reduced.get(B)!), undefined);
});

// ============================================================================
// Live: the data-set side names the same sets as the element side
// ============================================================================

const LIVE_URL = Deno.env.get("DHIS2_TEST_URL");

function liveOptions(): FetchOptions {
  return {
    dhis2Credentials: {
      url: LIVE_URL ?? "",
      username: Deno.env.get("DHIS2_TEST_USERNAME") ?? "",
      password: Deno.env.get("DHIS2_TEST_PASSWORD") ?? "",
    },
    retryOptions: { maxAttempts: 1 },
  };
}

type ElementSideRow = {
  id: string | null | undefined;
  dataSetElements:
    | Array<{
      dataSet:
        | {
          id: string | null | undefined;
          periodType: string | null | undefined;
        }
        | null
        | undefined;
    }>
    | null
    | undefined;
};

// A sample wide enough to need two chunks on the data-set side, read with
// the element-side field this app no longer asks for.
async function elementSideSample(
  options: FetchOptions,
): Promise<Record<string, DHIS2DataSetLink[]>> {
  const params = new URLSearchParams();
  params.set("fields", "id,dataSetElements[dataSet[id,periodType]]");
  params.set("filter", "domainType:eq:AGGREGATE");
  params.set("pageSize", "150");
  const res = await getDHIS2<{
    dataElements: ElementSideRow[] | null | undefined;
  }>("/api/dataElements.json", options, params);
  const expected: Record<string, DHIS2DataSetLink[]> = {};
  for (const row of res.dataElements ?? []) {
    if (row.id == null) continue;
    const byId = new Map<string, DHIS2DataSetLink>();
    for (const dse of row.dataSetElements ?? []) {
      if (dse.dataSet?.id == null) continue;
      byId.set(dse.dataSet.id, {
        id: dse.dataSet.id,
        periodType: dse.dataSet.periodType ?? undefined,
      });
    }
    expected[row.id] = [...byId.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );
  }
  return expected;
}

Deno.test({
  name: "live: data-set-side links equal element-side links for a sample",
  ignore: LIVE_URL === undefined,
  async fn() {
    const options = liveOptions();
    const expected = await elementSideSample(options);
    const ids = Object.keys(expected);
    assert(ids.length > 100, `sample of ${ids.length} needs two chunks`);
    assert(
      ids.some((id) => expected[id].length >= 2),
      "sample has no element in two data sets",
    );
    assertEquals(links(await getDataSetLinksByElement(options, ids)), expected);
  },
});

Deno.test({
  name: "live: the element fetcher attaches the same links",
  ignore: LIVE_URL === undefined,
  async fn() {
    const options = liveOptions();
    const expected = await elementSideSample(options);
    const ids = Object.keys(expected).slice(0, 100);
    const elements = await getDataElementsFromDHIS2(options, {
      filter: [`id:in:[${ids.join(",")}]`],
      paging: false,
    });
    assertEquals(elements.length, ids.length);
    for (const e of elements) {
      assertEquals(e.dataSets, expected[e.id], e.id);
    }
  },
});
