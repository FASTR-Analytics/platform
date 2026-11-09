// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// The whole of a host: a document in three signals, an in-memory image
// store, and the editor. Nothing here comes from any application.
import { createSignal } from "solid-js";
import {
  FASTR_PAGE_TEMPLATES,
  ReportForge,
  type ReportForgeApi,
  type ReportForgeSettings,
} from "report-forge";
import kitchenSink from "../../tests/fixtures/kitchen_sink.md?raw";
import manySections from "../../tests/fixtures/many_sections.md?raw";

const START = `# Quarterly review

A short report to try the editor on. Type anywhere on the page.

:::callout{kind=info title="What this is"}
The playground host: a body string, a settings object and an image record,
each held in a signal.
:::

## Findings

Write here.
`;

export function App() {
  const params = new URLSearchParams(location.search);
  // ?doc picks a fixture (the harness uses them), `templates` every page
  // template's example, or, with `new`, a document
  // nobody has chosen a look for; ?reader mounts read-only.
  const doc = params.get("doc");
  const [body, setBody] = createSignal(
    doc === "sink"
      ? kitchenSink
      : doc === "sections"
      ? manySections
      : doc === "new"
      ? "# Quarterly review\n"
      : doc === "templates"
      ? `# Page templates\n\nEvery layout, one page each.\n\n${
        FASTR_PAGE_TEMPLATES.map((t) => t.example).join("\n\n")
      }\n`
      : START,
  );
  const [settings, setSettings] = createSignal<ReportForgeSettings>({
    theme: (params.get("theme") as ReportForgeSettings["theme"]) ?? "default",
    ...(doc === "new" ? { themeChosen: false } : {}),
  });
  const [images, setImages] = createSignal<
    Record<string, { type: "image"; imgFile: string }>
  >({});
  // An image "store": object URLs, kept for the page's lifetime.
  const [library, setLibrary] = createSignal<string[]>([]);

  // For the harness: the editor's handle and the live body.
  const w = window as unknown as Record<string, unknown>;
  w.__body = body;

  return (
    <div
      style={{ height: "100vh", display: "flex", "flex-direction": "column" }}
    >
      <div
        style={{
          padding: "10px 16px",
          "font-family": "system-ui, sans-serif",
          "font-weight": "600",
          "border-bottom": "1px solid #cacaca",
        }}
      >
        Report Forge playground
      </div>
      <div style={{ flex: "1", "min-height": "0" }}>
        <ReportForge
          title="Quarterly review"
          canEdit={!params.has("reader")}
          body={body()}
          onBodyChange={setBody}
          settings={settings()}
          onSettingsChange={setSettings}
          images={images()}
          onImagesChange={setImages}
          imageHost={{
            assetUrl: (ref) => ref,
            upload: (file) => {
              const url = URL.createObjectURL(file);
              setLibrary((l) => [...l, url]);
              return Promise.resolve(url);
            },
            library,
          }}
          ref={(api: ReportForgeApi) => (w.__forge = api)}
        />
      </div>
    </div>
  );
}
