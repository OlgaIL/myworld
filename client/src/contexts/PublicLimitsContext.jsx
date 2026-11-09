import { createContext, useContext, useEffect, useState } from "react";
import { getPublicLimits } from "../services/api";
import { normalizePublicLimits } from "../utils/publicLimits";

const PublicLimitsContext = createContext(normalizePublicLimits(null));

export function PublicLimitsProvider({ children, initialLimits }) {
  const [limits, setLimits] = useState(() => normalizePublicLimits(initialLimits));
  useEffect(() => {
    let active = true;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const result = await getPublicLimits();
        if (active) setLimits(normalizePublicLimits(result));
      } catch {
        if (active) setLimits(normalizePublicLimits(null));
      } finally { pending = false; }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  return <PublicLimitsContext.Provider value={limits}>{children}</PublicLimitsContext.Provider>;
}

// Shared with its provider, like AuthContext.
// eslint-disable-next-line react-refresh/only-export-components
export function usePublicLimits() {
  return useContext(PublicLimitsContext);
}
