import { render } from "solid-js/web";
import { _KEY_COLORS } from "lib";
import { setBaseText, setGlobalStyle, setKeyColors } from "panther";
import App from "./app";
import {
  BASE_TEXT_OPTIONS,
  GLOBAL_STYLE_OPTIONS,
} from "./generate_visualization/get_style_from_po/_0_common";

// Light foundation + default panther-default-dark companion for on-screen
// dark rendering (FigureHolder scopes it per render; exports stay light).
// The remap opt-in flips module-authored near-black literal colors (the
// "Actual"/"Expected" lines, coverage defaults) to the dark baseContent —
// they vanish on dark bases otherwise.
setKeyColors(_KEY_COLORS, undefined, { remapNearBlackOnDark: true });
setBaseText(BASE_TEXT_OPTIONS);
setGlobalStyle(GLOBAL_STYLE_OPTIONS);

render(() => <App />, document.getElementById("app")!);
