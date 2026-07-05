import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AnalyticsTracker from "./components/AnalyticsTracker";
import CookieNotice from "./components/CookieNotice";
import App from "./pages/App";
import AccountPage from "./pages/AccountPage";
import AboutPage from "./pages/AboutPage";
import AdminPage from "./pages/AdminPage";
import PackagesPage from "./pages/PackagesPage";
import PrivacyPage from "./pages/PrivacyPage";
import RequisitesPage from "./pages/RequisitesPage";
import { AuthProvider } from "./contexts/AuthContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AnalyticsTracker />
      <CookieNotice />
      <Routes>
        <Route path="/admin-control" element={<AdminPage />} />
        <Route
          path="/account"
          element={
            <AuthProvider>
              <AccountPage />
            </AuthProvider>
          }
        />
        <Route path="/about" element={<AboutPage />} />
        <Route
          path="/packages"
          element={
            <AuthProvider>
              <PackagesPage />
            </AuthProvider>
          }
        />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/requisites" element={<RequisitesPage />} />
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
