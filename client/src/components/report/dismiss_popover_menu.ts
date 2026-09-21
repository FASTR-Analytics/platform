// Closing panther's context menu from inside a report widget.
//
// The popover is `popover="manual"`, so the browser never light-dismisses it;
// panther closes it from a document-level mousedown listener in the BUBBLE
// phase. Report widgets (cells, islands, the press claim) stopPropagation on
// mousedown, which starves that listener, so an open menu would survive a
// press on the document underneath it.
//
// panther's other document-level dismissal is Escape, and a keydown dispatched
// at the document reaches its listener directly, past any stopPropagation in
// the tree. That is the whole trick here: it is a stand-in for the `hideMenu`
// panther used to export, and it should go back to being a direct call if
// panther exports a dismissal again.
export function dismissPopoverMenu(): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
}
