import { useEffect, useState } from "react";
import { getCurrentUser, loginWithGoogle, logout } from "../services/api";

export function useAuth() {
  const [user, setUser] = useState(null);

  async function loadUser() {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
    return currentUser;
  }

  useEffect(() => {
    loadUser();
  }, []);

  return {
    user,
    login: loginWithGoogle,
    logout,
    reloadUser: loadUser
  };
}
