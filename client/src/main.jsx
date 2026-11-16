import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AppShell from "./AppShell";
import { PublicLimitsProvider } from "./contexts/PublicLimitsContext";
import "./index.css";
import { clarityController } from "./services/clarity";

clarityController?.install();

const root = document.getElementById("root");
const app = <React.StrictMode><BrowserRouter><PublicLimitsProvider><AppShell /></PublicLimitsProvider></BrowserRouter></React.StrictMode>;
if (root.dataset.prerendered === "true") {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
