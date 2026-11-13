// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// A file's text, imported with the bundler's `?raw` suffix (the vendored
// Paged.js build, which is inlined into every paged document).
declare module "*.js?raw" {
  const text: string;
  export default text;
}
