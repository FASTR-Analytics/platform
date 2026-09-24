import { render } from "solid-js/web";
import { setBaseText, setGlobalStyle, setKeyColorsFromCss } from "panther";
import App from "./app";
import {
  BASE_TEXT_OPTIONS,
  GLOBAL_STYLE_OPTIONS,
} from "./generate_visualization/get_style_from_po/_0_common";

// The canvas key colours are the CSS --color-* tokens, both halves, so a
// figure's base300 is the UI's base-300 in either scheme (FigureHolder
// scopes the dark half per render; exports stay light). The remap opt-in
// flips module-authored near-black literal colors (the "Actual"/"Expected"
// lines, coverage defaults) to the dark baseContent: they vanish on dark
// bases otherwise.
setKeyColorsFromCss({ remapNearBlackOnDark: true });
setBaseText(BASE_TEXT_OPTIONS);
setGlobalStyle(GLOBAL_STYLE_OPTIONS);

render(() => <App />, document.getElementById("app")!);
