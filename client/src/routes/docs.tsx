import { DocsViewer, FrameTop } from "@timroberton/panther";

export default function Docs() {
  return (
    <FrameTop
      panelChildren={<div class="border-base-300 bg-base-100 flex h-16e items-center border-b ui-pad">
        <h1 class="font-700 text-2xl">FASTR Analytics Platform Documentation</h1>
      </div>}
    >
      <div class="h-full w-full overflow-auto">
        <DocsViewer manifestUrl="/docs-manifest.json" basePath="/docs" />
      </div>
    </FrameTop>
  );
}
