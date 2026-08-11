import { useEffect, useState } from "react";
import { getAuthProviders, getCurrentUser, loginWithProvider as redirectToProvider, logout } from "../services/api";
import { getAcquisitionContext, trackGoal } from "../services/analytics";

const AUTH_PENDING_STORAGE_KEY = "word2you_auth_pending";

function rememberPendingAuth(providerId) {
  try {
    window.sessionStorage.setItem(AUTH_PENDING_STORAGE_KEY, providerId || "unknown");
  } catch {
    // Authentication must continue even when session storage is unavailable.
  }
}

function trackCompletedAuth(user) {
  if (!user) {
    return;
  }

  try {
    const providerId = window.sessionStorage.getItem(AUTH_PENDING_STORAGE_KEY);

    if (!providerId) {
      return;
    }

    window.sessionStorage.removeItem(AUTH_PENDING_STORAGE_KEY);
    trackGoal("account_authenticated", { provider: providerId });
  } catch {
    // A storage restriction should not affect the authenticated session.
  }
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [authProviders, setAuthProviders] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const defaultProvider = authProviders[0];
  const loginWithProvider = (providerId) => {
    trackGoal("auth_start", { provider: providerId });
    rememberPendingAuth(providerId);
    return redirectToProvider(providerId, getAcquisitionContext());
  };
  const defaultLogin = () => defaultProvider && loginWithProvider(defaultProvider.id);

  return {
    user,
    authProviders,
    authLoading: loading,
    login: defaultLogin,
    loginWithProvider,
    logout,
    reloadUser: () => loadUser({ showLoading: false })
  };
}
