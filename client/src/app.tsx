import { Router, Route } from "@solidjs/router";
import "./app.css";
import InstanceLoggedInWrapper from "./routes/index.tsx";
import AccessTokensPage from "./routes/access_tokens.tsx";

export default function App() {
  return (
    <Router>
      {/* Unlisted (no in-app link); Clerk-gated. NOT /pat — that path is the
          server's PAT API mount and never reaches the SPA. */}
      <Route path="/access-tokens" component={AccessTokensPage} />
      <Route path="/*" component={InstanceLoggedInWrapper} />
    </Router>
  );
}
