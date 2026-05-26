import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AnalyticsTracker from "./components/AnalyticsTracker";
import App from "./pages/App";
import AdminPage from "./pages/AdminPage";
import { AuthProvider } from "./contexts/AuthContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AnalyticsTracker />
      <Routes>
        <Route path="/admin-control" element={<AdminPage />} />
        <Route
          path="/"
          element={
            <AuthProvider>
              <App />
            </AuthProvider>
          }
        />
        <Route
          path="/documents/:documentName"
          element={
            <AuthProvider>
              <App />
            </AuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
