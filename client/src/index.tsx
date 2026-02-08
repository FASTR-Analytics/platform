import { render } from "solid-js/web";
import { _COLOR_WATERMARK_GREY, _KEY_COLORS } from "lib";
import { setGlobalStyle, setKeyColors } from "panther";
import App from "./app";

setKeyColors(_KEY_COLORS);
setGlobalStyle({
  scale: 1,
  baseText: {
    font: { fontFamily: "Inter", weight: 400, italic: false },
    fontSize: 24,
    lineHeight: 1.4,
  },
  page: {
    text: {
      watermark: {
        font: { fontFamily: "Inter", weight: 800, italic: false },
        color: _COLOR_WATERMARK_GREY,
        relFontSize: 25,
        lineHeight: 1.4,
      },
    },
  },
  markdown: {
    text: {
      code: {
        font: { fontFamily: "Roboto Mono" }
      }
    }
  }
});

render(() => <App />, document.getElementById("app")!);
