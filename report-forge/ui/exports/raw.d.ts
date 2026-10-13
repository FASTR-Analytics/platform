// A file's text, imported with the bundler's `?raw` suffix (the vendored
// Paged.js build, which is inlined into every paged document).
declare module "*.js?raw" {
  const text: string;
  export default text;
}
