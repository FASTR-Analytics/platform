import { generateDocsManifest } from "./panther/mod.deno.ts";
import { copy } from "@std/fs/copy";
import { emptyDir } from "@std/fs/empty-dir";
import { ensureDir } from "@std/fs/ensure-dir";

async function buildDocs() {
  console.log("Building documentation...\n");

  const docsSourceDir = "./docs";
  const docsOutputDir = "./client/public/docs";
  const manifestOutputPath = "./client/public/docs-manifest.json";

  console.log("Generating manifest from:", docsSourceDir);
  const manifest = await generateDocsManifest({
    inputDir: docsSourceDir,
    title: "HMIS Documentation",
  });

  await ensureDir("./client/public");
  await emptyDir(docsOutputDir);
  await ensureDir(docsOutputDir);

  console.log("Copying markdown files to:", docsOutputDir);
  await copy(docsSourceDir, docsOutputDir, {
    overwrite: true,
  });

  console.log("Writing manifest to:", manifestOutputPath);
  await Deno.writeTextFile(
    manifestOutputPath,
    JSON.stringify(manifest, null, 2),
  );

  console.log("\n✓ Build complete!");
  console.log(`  - ${manifest.pages.length} pages`);
  console.log(`  - ${manifest.navigation.length} sections`);
  console.log(`  - Output: ${docsOutputDir}/`);
  console.log(`  - Manifest: ${manifestOutputPath}`);
}

if (import.meta.main) {
  await buildDocs();
}
