import { useEffect, useState } from "react";
import { getCurrentUser, loginWithGoogle, logout } from "../services/api";

export function useAuth() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, []);

  return {
    user,
    login: loginWithGoogle,
    logout
  };
}
