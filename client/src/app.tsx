import { Router, Route } from "@solidjs/router";
import "./app.css";
import InstanceLoggedInWrapper from "./routes/index.tsx";
import PublicDashboard from "./components/public_viewer/dashboard.tsx";

export default function App() {
  return (
    <Router>
      <Route path="/d/:slug" component={PublicDashboard} />
      <Route path="/*" component={InstanceLoggedInWrapper} />
    </Router>
  );
}
