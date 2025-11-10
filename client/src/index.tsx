import { render } from "solid-js/web";
import { _KEY_COLORS } from "lib";
import {
  setGlobalFigureStyle,
  setGlobalPageStyle,
  setKeyColors,
} from "panther";
import { _GLOBAL_PAGE_STYLE_OPTIONS } from "./generate_report/mod";
import { _GLOBAL_FIGURE_STYLE_OPTIONS } from "./generate_visualization/mod";
import App from "./app";

setKeyColors(_KEY_COLORS);
setGlobalFigureStyle(_GLOBAL_FIGURE_STYLE_OPTIONS);
setGlobalPageStyle(_GLOBAL_PAGE_STYLE_OPTIONS);

render(() => <App />, document.getElementById("app")!);
