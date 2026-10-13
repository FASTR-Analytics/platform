import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { reportForge } from "../vite.ts";

// The playground is a host like any other: it mounts the package from the
// folder above with the package's own plugin and nothing else.
export default defineConfig({
  plugins: [solid(), reportForge()],
  server: { port: 3210, strictPort: true },
  build: { target: "esnext" },
});
