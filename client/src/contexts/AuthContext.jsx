import { createContext, useContext } from "react";
import { useAuth } from "../hooks/useAuth";
import EmailAuthModal from "../components/EmailAuthModal";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
      {auth.emailAuthOpen && (
        <EmailAuthModal
          onClose={auth.closeEmailAuth}
          onRequestCode={auth.requestEmailLoginCode}
          onVerifyCode={auth.verifyEmailLoginCode}
        />
      )}
    </AuthContext.Provider>
  );
}

// The hook intentionally shares the context module with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthContext() {
  return useContext(AuthContext);
}
