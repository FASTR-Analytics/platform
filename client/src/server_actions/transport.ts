// The transport seam lives in lib/ (compiled into both the SPA and the Deno
// server/headless host). This shim keeps the historical import path working.
export {
  getServerActionTransport,
  setServerActionTransport,
  type ServerActionTransport,
} from "lib";
