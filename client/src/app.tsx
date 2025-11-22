import { Router, Route } from "@solidjs/router";
import { Suspense } from "solid-js";
import "./app.css";
import InstanceLoggedInWrapper from "./routes/index.tsx";
import Docs from "./routes/docs.tsx";

export default function App() {
  return (
    <Router root={(props) => <Suspense>{props.children}</Suspense>}>
      <Route path="/" component={InstanceLoggedInWrapper} />
      <Route path="/docs" component={Docs} />
    </Router>
  );
}
