import type { Context } from "hono";
import type { APIResponseNoData, APIResponseWithData } from "lib";
import {
  FOLDER_NOT_FOUND,
  PRODUCT_NOT_FOUND,
  REPORT_NOT_FOUND,
  SLIDE_DECK_NOT_FOUND,
  SLIDE_NOT_FOUND,
  VERSION_NOT_FOUND,
} from "../../db/products/mod.ts";

const NOT_FOUND_ERRORS = new Set<string>([
  PRODUCT_NOT_FOUND,
  FOLDER_NOT_FOUND,
  SLIDE_DECK_NOT_FOUND,
  REPORT_NOT_FOUND,
  SLIDE_NOT_FOUND,
  VERSION_NOT_FOUND,
]);

// Every product-plane handler answers through this: a not-found envelope
// from the DB layer (an id outside the product named in the path, or a row
// that is gone) leaves as a 404, everything else at the default status.
// The client transport parses the envelope on any status.
export function respond<
  T extends APIResponseNoData | APIResponseWithData<unknown>,
>(c: Context, res: T) {
  return c.json(res, !res.success && NOT_FOUND_ERRORS.has(res.err) ? 404 : 200);
}
