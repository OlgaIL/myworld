import { Route, Routes, useLocation } from "react-router-dom";
import AnalyticsTracker from "./components/AnalyticsTracker";
import ClarityTracker from "./components/ClarityTracker";
import ClarityRouteBoundary from "./components/ClarityRouteBoundary";
import PresenceTracker from "./components/PresenceTracker";
import CookieNotice from "./components/CookieNotice";
import App from "./pages/App";
import AccountPage from "./pages/AccountPage";
import AboutPage from "./pages/AboutPage";
import AdminPage from "./pages/AdminPage";
import OcrReviewPage from "./pages/OcrReviewPage";
import ConsentPage from "./pages/ConsentPage";
import PackagesPage from "./pages/PackagesPage";
import HandwritingToTextLanding from "./pages/HandwritingToTextLanding";
import PhotoToTextLanding from "./pages/PhotoToTextLanding";
import FeatureLanding from "./pages/FeatureLanding";
import PrivacyPage from "./pages/PrivacyPage";
import RequisitesPage from "./pages/RequisitesPage";
import TermsPage from "./pages/TermsPage";
import { AuthProvider } from "./contexts/AuthContext";
import PageSeo from "./components/PageSeo";
import PromoNavigationScroll from "./components/PromoNavigationScroll";

export default function AppShell() {
  const isOcrReview = useLocation().pathname === "/admin-control/ocr-check";
  return (
    <>
      <PageSeo />
      <PromoNavigationScroll />
      {!isOcrReview && <><AnalyticsTracker /><ClarityTracker /><PresenceTracker /><CookieNotice /></>}
      <ClarityRouteBoundary><Routes>
        <Route path="/admin-control" element={<AdminPage />} />
        <Route path="/admin-control/ocr-check" element={<OcrReviewPage />} />
        <Route
          path="/account"
          element={
            <AuthProvider>
              <AccountPage />
            </AuthProvider>
          }
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/handwriting-to-text" element={<HandwritingToTextLanding />} />
        <Route path="/photo-to-text" element={<PhotoToTextLanding />} />
        <Route path="/batch-photo-to-text" element={<FeatureLanding kind="batch" />} />
        <Route path="/table-from-photo" element={<FeatureLanding kind="tables" />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route
          path="/packages"
          element={
            <AuthProvider>
              <PackagesPage />
            </AuthProvider>
          }
        />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/consent" element={<ConsentPage />} />
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
        <Route
          path="/guest-documents/:guestDocumentId"
          element={
            <AuthProvider>
              <App />
            </AuthProvider>
          }
        />
      </Routes></ClarityRouteBoundary>
    </>
  );
}
