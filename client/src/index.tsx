import { render } from "solid-js/web";
import { _KEY_COLORS } from "lib";
import { setGlobalStyle, setKeyColors } from "panther";
import App from "./app";
import { GLOBAL_STYLE_OPTIONS } from "./generate_visualization/get_style_from_po/_0_common";

setKeyColors(_KEY_COLORS);
setGlobalStyle(GLOBAL_STYLE_OPTIONS);

render(() => <App />, document.getElementById("app")!);
