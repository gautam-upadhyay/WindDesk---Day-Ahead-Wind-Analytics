import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import { NavigationGuardProvider } from "./NavigationGuard";
import "./styles.css";
import "./experience.css";
import "./workspace.css";

if (new URLSearchParams(window.location.search).get("perf") === "1") {
  void import("./performance")
    .then((module) => module.startPerformanceMeasurement())
    .catch(() => {
      console.warn("Local performance measurement could not start.");
    });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <NavigationGuardProvider>
        <App />
      </NavigationGuardProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
