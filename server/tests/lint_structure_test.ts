// Pins lint_structure.ts on temporary client trees: a clean tree reports
// nothing, one tree per check reports exactly that check, a type-only import
// does not make a cycle, and the scope argument hides hits outside it.
//
//   deno test -A server/tests/lint_structure_test.ts

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { CHECK_IDS, type CheckId, lintStructure } from "../../lint_structure.ts";

type Tree = Record<string, string>;

const CLEAN: Tree = {
  "app.tsx": `import { Products } from "~/components/products/mod.ts";\nimport { Data } from "~/components/data/mod.ts";\nexport const app = [Products, Data];\n`,
  "routes/index.tsx": `import { Shell } from "~/components/instance/mod.ts";\nexport default Shell;\n`,
  "components/instance/mod.ts": `export { Shell } from "./shell.tsx";\n`,
  "components/instance/shell.tsx": `import { Upload } from "../_shared/mod.ts";\nexport function Shell() {\n  return Upload;\n}\n`,
  "components/_shared/mod.ts": `export { Upload } from "./upload.tsx";\nexport * from "./figure_editor/mod.ts";\n`,
  "components/_shared/upload.tsx": `export function Upload() {}\n`,
  "components/_shared/figure_editor/mod.ts": `export { FigureEditor } from "./figure_editor.tsx";\n`,
  "components/_shared/figure_editor/figure_editor.tsx": `import { helper } from "~/generate_visualization/helper.ts";\nexport function FigureEditor() {\n  return helper;\n}\n`,
  "components/products/mod.ts": `export { Products } from "./products.tsx";\n`,
  "components/products/products.tsx": `import { Upload } from "../_shared/mod.ts";\nimport { FigureEditor } from "../_shared/figure_editor/mod.ts";\nimport { Deck } from "./slide_deck/mod.ts";\nimport { Panel } from "./_shared/mod.ts";\nimport { pdf } from "~/exports/export_pdf.ts";\nexport function Products() {\n  return [Upload, FigureEditor, Deck, Panel, pdf];\n}\n`,
  "components/products/slide_deck/mod.ts": `export { Deck } from "./deck.tsx";\n`,
  "components/products/slide_deck/deck.tsx": `import { Panel } from "../_shared/mod.ts";\nimport { FigureEditor } from "~/components/_shared/mod.ts";\nexport function Deck() {\n  return [Panel, FigureEditor];\n}\n`,
  "components/products/_shared/mod.ts": `export { Panel } from "./panel.tsx";\n`,
  "components/products/_shared/panel.tsx": `export function Panel() {}\n`,
  "components/data/mod.ts": `export { Data } from "./data.tsx";\n`,
  "components/data/data.tsx": `import { Upload } from "../_shared/mod.ts";\nimport { FigureEditor } from "../_shared/figure_editor/mod.ts";\nexport function Data() {\n  return [Upload, FigureEditor];\n}\n`,
  "generate_visualization/helper.ts": `import { x } from "~/state/store.ts";\nexport const helper = x;\n`,
  "state/store.ts": `export const x = 1;\n`,
  "exports/export_pdf.ts": `import { helper } from "~/generate_visualization/helper.ts";\nexport const pdf = helper;\n`,
};

const VIOLATIONS: Record<CheckId, Tree> = {
  "root-file": {
    "components/mod.ts": `export { Products } from "./products/mod.ts";\n`,
    "app.tsx": `import { Products } from "~/components/mod.ts";\nimport { Data } from "~/components/data/mod.ts";\nexport const app = [Products, Data];\n`,
  },
  "snake-case": {
    "components/data/data.tsx": "",
    "components/data/DataPage.tsx": CLEAN["components/data/data.tsx"],
    "components/data/mod.ts": `export { Data } from "./DataPage.tsx";\n`,
  },
  "index-entry": {
    "components/data/index.ts": `export const y = 1;\n`,
    "components/data/mod.ts": `export { Data } from "./data.tsx";\nexport * from "./index.ts";\n`,
  },
  "entry-only": {
    "components/data/data.tsx": `import { Upload } from "../_shared/mod.ts";\nimport { FigureEditor } from "../_shared/figure_editor/mod.ts";\nimport { Products } from "../products/products.tsx";\nexport function Data() {\n  return [Upload, FigureEditor, Products];\n}\n`,
  },
  "shared-scope": {
    "components/data/data.tsx": `import { Upload } from "../_shared/mod.ts";\nimport { FigureEditor } from "../_shared/figure_editor/mod.ts";\nimport { Panel } from "../products/_shared/mod.ts";\nexport function Data() {\n  return [Upload, FigureEditor, Panel];\n}\n`,
  },
  "shared-consumers": {
    "components/products/products.tsx": `import { Upload } from "../_shared/mod.ts";\nimport { FigureEditor } from "../_shared/figure_editor/mod.ts";\nimport { Deck } from "./slide_deck/mod.ts";\nimport { pdf } from "~/exports/export_pdf.ts";\nexport function Products() {\n  return [Upload, FigureEditor, Deck, pdf];\n}\n`,
  },
  "direction": {
    "state/store.ts": `import { Data } from "~/components/data/mod.ts";\nexport const x = Data;\n`,
  },
  "unimported": {
    "components/data/orphan.tsx": `export function Orphan() {}\n`,
  },
  "entry-cycle": {
    "components/products/_shared/panel.tsx": `import { Deck } from "../slide_deck/mod.ts";\nexport function Panel() {\n  return Deck;\n}\n`,
  },
};

const SHARED_HELPER: Tree = {
  "components/_shared/upload.tsx": `import { chunk } from "./upload_helper.tsx";\nexport function Upload() {\n  return chunk;\n}\n`,
  "components/_shared/upload_helper.tsx": `export const chunk = 1;\n`,
};

const TYPE_ONLY_CYCLE: Tree = {
  "components/products/_shared/panel.tsx": `import type { Deck } from "../slide_deck/mod.ts";\nexport function Panel(): Deck | null {\n  return null;\n}\n`,
};

async function withTree(overlay: Tree, body: (srcDir: string) => void): Promise<void> {
  const srcDir = await Deno.makeTempDir({ prefix: "lint_structure_" });
  try {
    for (const [path, content] of Object.entries({ ...CLEAN, ...overlay })) {
      if (content === "") continue;
      await Deno.mkdir(join(srcDir, path, ".."), { recursive: true });
      await Deno.writeTextFile(join(srcDir, path), content);
    }
    body(srcDir);
  } finally {
    await Deno.remove(srcDir, { recursive: true });
  }
}

Deno.test("lint_structure: a clean tree has no hits", async () => {
  await withTree({}, (srcDir) => assertEquals(lintStructure(srcDir), []));
});

for (const check of CHECK_IDS) {
  Deno.test(`lint_structure: one ${check} violation is reported as ${check} and nothing else`, async () => {
    await withTree(VIOLATIONS[check], (srcDir) => {
      assertEquals(lintStructure(srcDir).map((h) => h.check), [check]);
    });
  });
}

Deno.test("lint_structure: a helper used only by a shared file is as shared as that file", async () => {
  await withTree(SHARED_HELPER, (srcDir) => assertEquals(lintStructure(srcDir), []));
});

Deno.test("lint_structure: a type-only import does not make an entry cycle", async () => {
  await withTree(TYPE_ONLY_CYCLE, (srcDir) => assertEquals(lintStructure(srcDir), []));
});

Deno.test("lint_structure: the scope argument hides hits outside it", async () => {
  await withTree(VIOLATIONS["unimported"], (srcDir) => {
    assertEquals(lintStructure(srcDir, "components/products"), []);
    assertEquals(lintStructure(srcDir, "components/data").map((h) => h.file), ["components/data/orphan.tsx"]);
  });
});
