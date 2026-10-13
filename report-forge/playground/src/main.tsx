import { render } from "solid-js/web";
import "report-forge/styles.css";
import { Kit } from "./kit.tsx";
import { runProbe } from "./probe.ts";

render(() => <Kit />, document.getElementById("app")!);

if (new URLSearchParams(location.search).has("probe")) void runProbe();
