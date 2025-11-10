/*!
 * FileSaver.js - A saveAs() FileSaver implementation
 *
 * @license MIT License
 * Copyright (c) 2016 Eli Grey
 *
 * Original Source: https://github.com/eligrey/FileSaver.js
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * This file is a vendored copy from FileSaver.js, converted to TypeScript.
 *
 * Modifications made:
 * - Converted from JavaScript to TypeScript with type annotations
 * - Added TypeScript type definitions (BomOptions, SaveAsFunction)
 * - Added @ts-ignore comment for deprecated initMouseEvent
 *
 * Date vendored: 2024
 * Vendored for: timroberton-panther library
 *
 * ============================================================================
 */

// The one and only way of getting global scope in all environments
// https://stackoverflow.com/q/3277182/1008999
const _global: any = typeof window === "object" && window.window === window
  ? window
  : typeof self === "object" && self.self === self
  ? self
  : globalThis;

type BomOptions = { autoBom: boolean };

function bom(blob: Blob, opts?: BomOptions | boolean): Blob {
  let options: BomOptions;
  if (typeof opts === "undefined") {
    options = { autoBom: false };
  } else if (typeof opts !== "object") {
    console.warn("Deprecated: Expected third argument to be a object");
    options = { autoBom: !opts };
  } else {
    options = opts;
  }

  // prepend BOM for UTF-8 XML and text/* types (including HTML)
  // note: your browser will automatically convert UTF-16 U+FEFF to EF BB BF
  if (
    options.autoBom &&
    /^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i
      .test(
        blob.type,
      )
  ) {
    return new Blob([String.fromCharCode(0xfeff), blob], { type: blob.type });
  }
  return blob;
}

function download(
  url: string,
  name: string,
  opts?: BomOptions | boolean,
): void {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url);
  xhr.responseType = "blob";
  xhr.onload = function () {
    saveAs(xhr.response as Blob, name, opts);
  };
  xhr.onerror = function () {
    console.error("could not download file");
  };
  xhr.send();
}

function corsEnabled(url: string): boolean {
  const xhr = new XMLHttpRequest();
  // use sync to avoid popup blocker
  xhr.open("HEAD", url, false);
  try {
    xhr.send();
  } catch (e) {}
  return xhr.status >= 200 && xhr.status <= 299;
}

// `a.click()` doesn't work for all browsers (#465)
function click(node: HTMLElement): void {
  try {
    node.dispatchEvent(new MouseEvent("click"));
  } catch (e) {
    // Fallback for older browsers
    const evt = document.createEvent("MouseEvents");
    // @ts-ignore - initMouseEvent is deprecated but needed for legacy browser support
    evt.initMouseEvent(
      "click",
      true,
      true,
      window,
      0,
      0,
      0,
      80,
      20,
      false,
      false,
      false,
      false,
      0,
      null,
    );
    node.dispatchEvent(evt);
  }
}

// Detect WebView inside a native macOS app by ruling out all browsers
// We just need to check for 'Safari' because all other browsers (besides Firefox) include that too
// https://www.whatismybrowser.com/guides/the-latest-user-agent/macos
const isMacOSWebView: boolean = _global.navigator &&
  /Macintosh/.test(navigator.userAgent) &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Safari/.test(navigator.userAgent);

type SaveAsFunction = (
  blob: Blob | string,
  name?: string,
  opts?: BomOptions | boolean,
  popup?: Window | null,
) => void;

const saveAs: SaveAsFunction = _global.saveAs ||
  // probably in some web worker
  (typeof window !== "object" || window !== _global
    ? function saveAs() {
      /* noop */
    }
    // Use download attribute first if possible (#193 Lumia mobile) unless this is a macOS WebView
    : "download" in HTMLAnchorElement.prototype && !isMacOSWebView
    ? function saveAs(
      blob: Blob | string,
      name?: string,
      opts?: BomOptions | boolean,
    ): void {
      const URL = _global.URL || _global.webkitURL;
      // Namespace is used to prevent conflict w/ Chrome Poper Blocker extension (Issue #561)
      const a = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "a",
      ) as HTMLAnchorElement;
      name = name || (blob as any).name || "download";

      a.download = name!;
      a.rel = "noopener"; // tabnabbing

      // TODO: detect chrome extensions & packaged apps
      // a.target = '_blank'

      if (typeof blob === "string") {
        // Support regular links
        a.href = blob;
        if (a.origin !== location.origin) {
          corsEnabled(a.href)
            ? download(blob, name!, opts)
            : ((a.target = "_blank"), click(a));
        } else {
          click(a);
        }
      } else {
        // Support blobs
        a.href = URL.createObjectURL(blob as Blob);
        setTimeout(function () {
          URL.revokeObjectURL(a.href);
        }, 4e4); // 40s
        setTimeout(function () {
          click(a);
        }, 0);
      }
    }
    // Use msSaveOrOpenBlob as a second approach
    : "msSaveOrOpenBlob" in navigator
    ? function saveAs(
      blob: Blob | string,
      name?: string,
      opts?: BomOptions | boolean,
    ): void {
      name = name || (blob as any).name || "download";

      if (typeof blob === "string") {
        if (corsEnabled(blob)) {
          download(blob, name!, opts);
        } else {
          const a = document.createElement("a");
          a.href = blob;
          a.target = "_blank";
          setTimeout(function () {
            click(a);
          });
        }
      } else {
        (navigator as any).msSaveOrOpenBlob(
          bom(blob as Blob, opts),
          name,
        );
      }
    }
    // Fallback to using FileReader and a popup
    : function saveAs(
      blob: Blob | string,
      name?: string,
      opts?: BomOptions | boolean,
      popup?: Window | null,
    ): void {
      // Open a popup immediately do go around popup blocker
      // Mostly only available on user interaction and the fileReader is async so...
      popup = popup || open("", "_blank");
      if (popup) {
        popup.document.title =
          popup.document.body.innerText =
            "downloading...";
      }

      if (typeof blob === "string") return download(blob, name!, opts);

      const force = (blob as Blob).type === "application/octet-stream";
      const isSafari = /constructor/i.test(_global.HTMLElement) ||
        _global.safari;
      const isChromeIOS = /CriOS\/[\d]+/.test(navigator.userAgent);

      if (
        (isChromeIOS || (force && isSafari) || isMacOSWebView) &&
        typeof FileReader !== "undefined"
      ) {
        // Safari doesn't allow downloading of blob URLs
        const reader = new FileReader();
        reader.onloadend = function () {
          let url = reader.result as string;
          url = isChromeIOS ? url : (url as string).replace(
            /^data:[^;]*;/,
            "data:attachment/file;",
          );
          if (popup) popup.location.href = url as string;
          else (location as any) = url;
          popup = null; // reverse-tabnabbing #460
        };
        reader.readAsDataURL(blob as Blob);
      } else {
        const URL = _global.URL || _global.webkitURL;
        const url = URL.createObjectURL(blob as Blob);
        if (popup) (popup.location as any) = url;
        else location.href = url;
        popup = null; // reverse-tabnabbing #460
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 4e4); // 40s
      }
    });

_global.saveAs = (saveAs as any).saveAs = saveAs;

export { saveAs };
