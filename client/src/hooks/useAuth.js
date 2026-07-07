import { useEffect, useState } from "react";
import { getAuthProviders, getCurrentUser, loginWithGoogle, loginWithYandex, logout } from "../services/api";

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
          getAuthProviders().catch(() => [{ id: "yandex", label: "Яндекс" }])
        ]);
        setUser(currentUser);
        setAuthProviders(Array.isArray(providers) ? providers : []);
      } finally {
        setLoading(false);
      }
    }

    loadInitialAuthState();
  }, []);

  const defaultLogin = authProviders.some((provider) => provider.id === "google")
    ? loginWithGoogle
    : loginWithYandex;

  return {
    user,
    authProviders,
    authLoading: loading,
    login: defaultLogin,
    loginWithGoogle,
    loginWithYandex,
    logout,
    reloadUser: () => loadUser({ showLoading: false })
  };
}
