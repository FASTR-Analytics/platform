/*!
 * solid-sortablejs v2.1.2 - SolidJS bindings for SortableJS
 *
 * @license MIT License
 * Copyright (c) 2022 Supertigerr
 *
 * Original Source: https://www.npmjs.com/package/solid-sortablejs
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
 * This file is a vendored and modified copy of solid-sortablejs v2.1.2.
 *
 * Modifications made:
 * 1. Changed import to 'sortablejs/modular/sortable.complete.esm.js' (line 30)
 * 2. Added MultiDrag plugin support fields to SORTABLE_OPTION_FIELDS (lines 76-80)
 * 3. Moved animation default after spread operator for proper override (line 115-116)
 * 4. Added debug console.log statements (lines 97, 103-113, 165-174)
 *
 * Reason for vendoring: Original GitHub repository (thisbeyond/solid-sortablejs)
 * is no longer accessible. Patches were required for MultiDrag plugin support.
 *
 * Date vendored: 2024
 * Vendored for: timroberton-panther library
 *
 * ============================================================================
 */

// @ts-nocheck - Vendored file, preserving original code

import {
  createComponent,
  effect,
  insert,
  mergeProps,
  setAttribute,
  spread,
  template,
  use,
} from "solid-js/web";
import { createEffect, For, onCleanup, onMount, splitProps } from "solid-js";
import SortableJs from "sortablejs/modular/sortable.complete.esm.js";

const _tmpl$ = /*#__PURE__*/ template(`<div></div>`, 2);
const SORTABLE_OPTION_FIELDS = [
  "animation",
  "chosenClass",
  "dataIdAttr",
  "delay",
  "delayOnTouchOnly",
  "direction",
  "disabled",
  "dragClass",
  "draggable",
  "dragoverBubble",
  "dropBubble",
  "easing",
  "fallbackClass",
  "fallbackOffset",
  "fallbackOnBody",
  "fallbackTolerance",
  "filter",
  "forceFallback",
  "ghostClass",
  "group",
  "handle",
  "ignore",
  "invertedSwapThreshold",
  "invertSwap",
  "onAdd",
  "onChange",
  "onChoose",
  "onClone",
  "onEnd",
  "onFilter",
  "onMove",
  "onRemove",
  "onSelect",
  "onSort",
  "onStart",
  "onUnchoose",
  "onUpdate",
  "preventOnFilter",
  "removeCloneOnHide",
  "setData",
  "sort",
  "swapThreshold",
  "multiDrag",
  "selectedClass",
  "multiDragKey",
  "onDeselect",
  "avoidImplicitDeselect",
];
// Would love to type-check if all fields are present, but that seems rather challenging - https://stackoverflow.com/questions/58167616/typescript-create-an-exhaustive-tuple-type-from-another-type/58170994#58170994

const OUR_PROPS = [
  "items",
  "setItems",
  "idField",
  "class",
  "style",
  "id",
  "children",
];
const dragging = {
  item: undefined,
};
function Sortable(props) {
  // console.error("[solid-sortablejs] Component function called");
  let sortableContainerRef;
  let sortable;
  const [options, otherAndOurProps] = splitProps(props, SORTABLE_OPTION_FIELDS);
  const [ourProps, otherProps] = splitProps(otherAndOurProps, OUR_PROPS);
  onMount(() => {
    // console.log("[solid-sortablejs] Creating Sortable with options:", options);
    // console.log("[solid-sortablejs] Using Sortable constructor:", SortableJs);
    // console.log(
    //   "[solid-sortablejs] Same as __OUR_SORTABLE__?",
    //   SortableJs === window.__OUR_SORTABLE__
    // );
    // console.log("[solid-sortablejs] SortableJs.utils:", SortableJs.utils);
    // console.log(
    //   "[solid-sortablejs] SortableJs.create is overridden?",
    //   SortableJs.create.toString().includes("[Override]")
    // );
    sortable = SortableJs.create(sortableContainerRef, {
      animation: 150,
      ...options,
      onStart(event) {
        dragging.item = ourProps.items[parseInt(event.item.dataset.index)];
        options.onStart?.(event);
      },
      onAdd(event) {
        const children = [...event.to?.children];
        const newItems = children.map(
          (v) =>
            ourProps.items.find(
              (item) => item[ourProps.idField].toString() === v.dataset.id,
            ) || dragging.item,
        );
        // from: where it came from
        // to:   added to
        children.splice(event.newIndex, 1);
        event.to?.replaceChildren(...children);
        ourProps.setItems(newItems);
        options.onAdd?.(event);
      },
      onRemove(event) {
        // from: where it removed from
        // to: where it added to
        const children = [...event.from?.children];
        const newItems = children.map((v) =>
          ourProps.items.find(
            (item) => item[ourProps.idField].toString() === v.dataset.id,
          )
        );
        children.splice(event.oldIndex, 0, event.item);
        event.from.replaceChildren(...children);
        ourProps.setItems(newItems);
        options.onRemove?.(event);
      },
      onEnd(event) {
        const children = [...sortableContainerRef?.children];
        const newItems = children.map((v) =>
          ourProps.items.find(
            (item) => item[ourProps.idField].toString() === v.dataset.id,
          )
        );
        children.sort(
          (a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index),
        );
        sortableContainerRef?.replaceChildren(...children);
        ourProps.setItems(newItems);
        dragging.item = undefined;
        options.onEnd?.(event);
      },
    });
    // console.log("[solid-sortablejs] Created instance:", sortable);
    // console.log("[solid-sortablejs] Instance options:", sortable.options);
    // console.log(
    //   "[solid-sortablejs] Instance has multiDrag?",
    //   sortable.multiDrag,
    // );
    // console.log(
    //   "[solid-sortablejs] Instance methods:",
    //   Object.getOwnPropertyNames(Object.getPrototypeOf(sortable)),
    // );
    onCleanup(() => {
      sortable.destroy();
    });
  });
  createEffect((prev) => {
    const clonedProps = {
      ...options,
    };
    if (!prev);
    else {
      const diff = Object.entries(clonedProps).filter(
        ([key, newVal]) => newVal != prev[key],
      );
      //console.debug('props update', diff, { newProps: clonedProps, prev })
      for (const [key, newVal] of diff) {
        if (["onStart", "onAdd", "onRemove", "onEnd"].includes(key)) {
          console.warn(
            `Reactive callbacks are not supported yet in solid-sortablejs. Changed:`,
            key,
          );
        } else sortable.option(key, newVal);
      }
    }
    return clonedProps;
  }, null);
  return (() => {
    const _el$ = _tmpl$.cloneNode(true);
    const _ref$ = sortableContainerRef;
    typeof _ref$ === "function"
      ? use(_ref$, _el$)
      : (sortableContainerRef = _el$);
    spread(
      _el$,
      mergeProps(otherProps, {
        get ["class"]() {
          return "sortablejs" + (ourProps.class ? ` ${ourProps.class}` : "");
        },
      }),
      false,
      true,
    );
    insert(
      _el$,
      createComponent(For, {
        get each() {
          return ourProps.items;
        },
        children: (item, i) =>
          (() => {
            const _el$2 = _tmpl$.cloneNode(true);
            insert(_el$2, () => ourProps.children(item));
            effect(
              (_p$) => {
                const _v$ = item[ourProps.idField],
                  _v$2 = i();
                _v$ !== _p$._v$ &&
                  setAttribute(_el$2, "data-id", _p$._v$ = _v$);
                _v$2 !== _p$._v$2 &&
                  setAttribute(_el$2, "data-index", _p$._v$2 = _v$2);
                return _p$;
              },
              {
                _v$: undefined,
                _v$2: undefined,
              },
            );
            return _el$2;
          })(),
      }),
    );
    return _el$;
  })();
}

export { Sortable as default };
