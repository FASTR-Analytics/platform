// An uploaded file keeps its name as the user's machine gave it: tus-js-client
// sends Upload-Metadata values as base64 of their UTF-8 bytes, so a macOS
// screenshot name, whose time is followed by a narrow no-break space, must
// land in asset_metadata, on disk and in the assets broadcast unchanged, and
// the completion response must still be sendable. Runs the real TUS route on
// the dev database.
//
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/upload_filename_test.ts

import { assert, assertEquals } from "@std/assert";
import { encodeBase64 } from "@std/encoding";
import { join } from "@std/path";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { _ASSETS_DIR_PATH } from "../exposed_env_vars.ts";
import { routesUpload } from "../routes/instance/upload.ts";
import { appFor, assertRealAuth, captured } from "./_harness/route_app.ts";

const tag = crypto.randomUUID().slice(0, 8);
const UPLOADER = `upload-filename-test-${tag}@example.com`;
const NAME = `Screenshot ${tag} at 3.14.15 PM é.png`;
const BYTES = new TextEncoder().encode("not really a png");

Deno.test("upload: a non-ASCII file name is stored as the client sent it", async () => {
  assertRealAuth();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  await mainDb`INSERT INTO users (email, is_admin) VALUES (${UPLOADER}, FALSE)`;
  try {
    const app = appFor(UPLOADER, routesUpload);
    let completed: Response | undefined;
    // The route refreshes the asset list after it responds; captured waits
    // for that broadcast, so no query outlives the test.
    const broadcasts = await captured(async () => {
      const created = await app.request("/upload", {
        method: "POST",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(BYTES.length),
          "Upload-Metadata": `filename ${encodeBase64(NAME)}`,
        },
      });
      assertEquals(created.status, 201);
      const uploadId = created.headers.get("Location")!.split("/").at(-1)!;
      completed = await app.request(`/upload/${uploadId}`, {
        method: "PATCH",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": "0",
          "Content-Type": "application/offset+octet-stream",
        },
        body: BYTES,
      });
    });

    const stored = await mainDb<{ file_name: string }[]>`
      SELECT file_name FROM asset_metadata WHERE uploader_email = ${UPLOADER}
    `;
    assertEquals(stored.map((r) => r.file_name), [NAME]);
    assertEquals(await Deno.readFile(join(_ASSETS_DIR_PATH, NAME)), BYTES);
    assert(
      broadcasts.some((m) =>
        m.type === "assets_updated" && m.data.some((a) => a.fileName === NAME)
      ),
      "the assets broadcast does not list the file under its name",
    );
    assertEquals(completed?.status, 204);
    assertEquals(
      decodeURIComponent(completed!.headers.get("X-Upload-Filename")!),
      NAME,
    );
  } finally {
    const stored = await mainDb<{ file_name: string }[]>`
      DELETE FROM asset_metadata WHERE uploader_email = ${UPLOADER}
      RETURNING file_name
    `;
    for (const { file_name } of stored) {
      await Deno.remove(join(_ASSETS_DIR_PATH, file_name)).catch(() => {});
    }
    await mainDb`DELETE FROM users WHERE email = ${UPLOADER}`;
    await closeAllConnections();
  }
});
