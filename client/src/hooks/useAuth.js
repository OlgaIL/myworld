import { useEffect, useState } from "react";
import { getCurrentUser, loginWithGoogle, loginWithYandex, logout } from "../services/api";

export function useAuth() {
  const [user, setUser] = useState(null);
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
    loadUser({ showLoading: true });
  }, []);

  return {
    user,
    authLoading: loading,
    login: loginWithGoogle,
    loginWithGoogle,
    loginWithYandex,
    logout,
    reloadUser: () => loadUser({ showLoading: false })
  };
}
