import { useEffect, useState } from "react";
import {
  getAuthProviders,
  getCurrentUser,
  loginWithProvider as redirectToProvider,
  logout,
  requestEmailLoginCode as requestEmailLoginCodeApi,
  saveAnalyticsIdentity,
  verifyEmailLoginCode as verifyEmailLoginCodeApi
} from "../services/api";
import {
  getAcquisitionContext,
  getAnalyticsDeviceContext,
  requestMetrikaClientIdWhenReady,
  setAuthenticatedMetrikaUser,
  trackGoal
} from "../services/analytics";
import { LEGAL_AGREEMENT_VERSION } from "../constants/legalAgreement";

const AUTH_PENDING_STORAGE_KEY = "word2you_auth_pending";

function rememberPendingAuth(providerId, source = "") {
  try {
    window.sessionStorage.setItem(AUTH_PENDING_STORAGE_KEY, JSON.stringify({
      provider: providerId || "unknown",
      ...(source ? { source } : {})
    }));
  } catch {
    // Authentication must continue even when session storage is unavailable.
  }
}

function trackCompletedAuth(user) {
  if (!user) {
    return;
  }

  try {
    const storedValue = window.sessionStorage.getItem(AUTH_PENDING_STORAGE_KEY);

    if (!storedValue) {
      return;
    }

    let authContext;
    try {
      authContext = JSON.parse(storedValue);
    } catch {
      authContext = { provider: storedValue };
    }

    window.sessionStorage.removeItem(AUTH_PENDING_STORAGE_KEY);
    trackGoal("account_authenticated", {
      provider: authContext.provider || "unknown",
      ...(authContext.source ? { source: authContext.source } : {})
    });
  } catch {
    // A storage restriction should not affect the authenticated session.
  }
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [authProviders, setAuthProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailAuthOpen, setEmailAuthOpen] = useState(false);

  async function loadUser({ showLoading = true } = {}) {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    async function loadInitialAuthState() {
      try {
        setLoading(true);
        const [currentUser, providers] = await Promise.all([
          getCurrentUser(),
          getAuthProviders().catch(() => [])
        ]);
        setUser(currentUser);
        trackCompletedAuth(currentUser);
        setAuthProviders(Array.isArray(providers) ? providers : []);
      } finally {
        setLoading(false);
      }
    }

    loadInitialAuthState();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const deviceContext = getAnalyticsDeviceContext();
    setAuthenticatedMetrikaUser(user.id);
    saveAnalyticsIdentity(deviceContext).catch(() => {
      // Analytics must never block authentication or product usage.
    });
    const cancelClientIdRequest = requestMetrikaClientIdWhenReady((metrikaClientId) => {
      if (!metrikaClientId) {
        return;
      }

      saveAnalyticsIdentity({ ...deviceContext, metrikaClientId }).catch(() => {
        // Analytics must never block authentication or product usage.
      });
    });

    return cancelClientIdRequest;
  }, [user?.id]);

  const defaultProvider = authProviders[0];
  const loginWithProvider = (providerId, { source = "" } = {}) => {
    trackGoal("auth_start", { provider: providerId });
    rememberPendingAuth(providerId, source);

    if (providerId === "email") {
      setEmailAuthOpen(true);
      return;
    }

    return redirectToProvider(providerId, getAcquisitionContext());
  };
  const requestEmailLoginCode = async (email, { resend = false } = {}) => {
    const result = await requestEmailLoginCodeApi(email, getAcquisitionContext());
    trackGoal(resend ? "auth_email_resend" : "auth_email_requested", { provider: "email" });
    return result;
  };
  const verifyEmailLoginCode = async (email, code) => {
    try {
      await verifyEmailLoginCodeApi({ email, code, legalVersion: LEGAL_AGREEMENT_VERSION });
      const currentUser = await loadUser({ showLoading: false });
      trackCompletedAuth(currentUser);
      setEmailAuthOpen(false);
      return currentUser;
    } catch (error) {
      trackGoal("auth_email_code_failed", { provider: "email" });
      throw error;
    }
  };
  const defaultLogin = () => defaultProvider && loginWithProvider(defaultProvider.id);

  return {
    user,
    authProviders,
    authLoading: loading,
    login: defaultLogin,
    loginWithProvider,
    emailAuthOpen,
    closeEmailAuth: () => setEmailAuthOpen(false),
    requestEmailLoginCode,
    verifyEmailLoginCode,
    logout,
    reloadUser: () => loadUser({ showLoading: false })
  };
}
