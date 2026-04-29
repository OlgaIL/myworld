import { useEffect, useState } from "react";
import { getCurrentUser, loginWithGoogle, logout } from "../services/api";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadUser() {
    try {
      setLoading(true);
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  return {
    user,
    authLoading: loading,
    login: loginWithGoogle,
    logout,
    reloadUser: loadUser
  };
}
