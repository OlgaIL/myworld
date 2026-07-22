import { useEffect, useState } from "react";
import { getAuthProviders, getCurrentUser, loginWithProvider, logout } from "../services/api";

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
        setAuthProviders(Array.isArray(providers) ? providers : []);
      } finally {
        setLoading(false);
      }
    }

    loadInitialAuthState();
  }, []);

  const defaultProvider = authProviders[0];
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
