import { render } from "solid-js/web";
import "report-forge/styles.css";
import { App } from "./app.tsx";
import { Kit } from "./kit.tsx";
import { runProbe } from "./probe.ts";

// ?kit shows the component kit on its own; otherwise the editor.
const params = new URLSearchParams(location.search);
render(
  () => (params.has("kit") ? <Kit /> : <App />),
  document.getElementById("app")!,
);

if (params.has("probe")) void runProbe();
