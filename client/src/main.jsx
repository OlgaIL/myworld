import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AnalyticsTracker from "./components/AnalyticsTracker";
import App from "./pages/App";
import { AuthProvider } from "./contexts/AuthContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AnalyticsTracker />
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/documents/:documentName" element={<App />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
