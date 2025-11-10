import { Router, Route } from "@solidjs/router";
import { Suspense } from "solid-js";
import "./app.css";
import InstanceLoggedInWrapper from "./routes/index.tsx";

export default function App() {
  return (
    <Router root={(props) => <Suspense>{props.children}</Suspense>}>
      <Route path="/" component={InstanceLoggedInWrapper} />
    </Router>
  );
}
