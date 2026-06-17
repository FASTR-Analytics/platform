import { render } from "solid-js/web";
import { _KEY_COLORS } from "lib";
import { setBaseText, setGlobalStyle, setKeyColors } from "panther";
import App from "./app";
import {
  BASE_TEXT_OPTIONS,
  GLOBAL_STYLE_OPTIONS,
} from "./generate_visualization/get_style_from_po/_0_common";

setKeyColors(_KEY_COLORS);
setBaseText(BASE_TEXT_OPTIONS);
setGlobalStyle(GLOBAL_STYLE_OPTIONS);

render(() => <App />, document.getElementById("app")!);
