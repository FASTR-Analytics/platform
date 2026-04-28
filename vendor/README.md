# Vendored Dependencies

## postgres (v3.4.5 + fix)

**Why vendored:** postgres.js has a race condition bug that causes server crashes under high concurrency with the error "May not write null values to stream".

**The bug:** In `src/connection.js`, the `nextWrite` function can be called via `setImmediate` after `chunk` has already been set to `null` by a previous write, causing the crash.

**The fix:** Added a null guard in `nextWrite()` at line 250:
```js
function nextWrite(fn) {
  if (chunk === null) return true  // <-- FIX
  const x = socket.write(chunk, fn)
  // ...
}
```

**Upstream issues:** 
- https://github.com/porsager/postgres/issues/1154
- https://github.com/porsager/postgres/issues/1066

**When to remove:** Once the fix is merged upstream and released, update to that version and remove this vendor directory. Then remove the `links` and `nodeModulesDir` fields from deno.json.
